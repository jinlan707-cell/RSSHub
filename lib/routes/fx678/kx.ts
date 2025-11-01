import { Route, ViewType } from '@/types';
import cache from '@/utils/cache';
import { load } from 'cheerio';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

// 添加请求重试函数
async function gotWithRetry(url, options = {}, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await got.get(url, options);
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1000)); // 等待1秒后重试
        }
    }
}

export const route: Route = {
    path: '/kx',
    categories: ['finance'],
    view: ViewType.Notifications,
    example: '/fx678/kx',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['fx678.com/kx'],
        },
    ],
    name: '7x24 小时快讯',
    maintainers: ['occupy5', 'dousha'],
    handler,
    url: 'fx678.com/kx',
};

async function handler() {
    const link = 'https://www.fx678.com/kx/';
    try {
        // 使用重试函数获取列表页
        const res = await gotWithRetry(link);
        const $ = load(res.data);
        
        // 页面新闻消息列表
        const list = $('.body_zb ul .body_zb_li .zb_word')
            .find('.list_font_pic > a:first-child')
            .toArray()
            .slice(0, 100)
            .map((e) => $(e).attr('href'));

        // 添加过滤无效链接
        const validList = list.filter((url) => url && url.startsWith('https://www.fx678.com'));

        const out = await Promise.all(
            validList.map((itemUrl) =>
                cache.tryGet(itemUrl, async () => {
                    try {
                        // 使用重试函数获取详情页
                        const res = await gotWithRetry(itemUrl);
                        const $ = load(res.data);

                        // 添加空值检查
                        const contentPart = $('.article-main .content').html() ?? '';
                        const forewordPart = $('.article-main .foreword').html() ?? '';
                        const datetimeString = $('.article-cont .details i').text() ?? '';
                        const titleElement = $('.article-main .foreword').text() ?? '';

                        // 安全处理字符串
                        const content = contentPart.trim();
                        const foreword = forewordPart.trim();
                        const parsedDateTime = datetimeString.trim();
                        const title = titleElement.trim().split('——').pop() ?? '';

                        const articlePubDate = parsedDateTime
                            ? timezone(parseDate(parsedDateTime, 'YYYY-MM-DD HH:mm:ss'), +8)
                            : new Date();

                        const item = {
                            title,
                            link: itemUrl,
                            description: content.length > 0 ? content : foreword,
                            pubDate: articlePubDate,
                        };

                        return item;
                    } catch (error) {
                        console.error(`Failed to process ${itemUrl}:`, error.message);
                        return null; // 跳过无效项
                    }
                })
            )
        );

        // 过滤有效项
        const filteredOut = out.filter((item) => item !== null);

        return {
            title: '7x24小时快讯',
            link,
            item: filteredOut,
        };
    } catch (error) {
        console.error('Failed to fetch data:', error.message);
        throw error; // 可根据需要调整错误处理
    }
}
