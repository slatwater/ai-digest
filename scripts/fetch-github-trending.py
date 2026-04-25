#!/usr/bin/env python3
"""抓取 GitHub trending 三个页面（all / typescript / python）各前 3 个 repo，
输出 JSON 到 stdout，结构：{ items: [{repo,url,category}], fetchedAt, date }"""
import json
import sys
from datetime import datetime
from scrapling import Fetcher

CATEGORIES = [
    ('all', 'https://github.com/trending'),
    ('typescript', 'https://github.com/trending/typescript'),
    ('python', 'https://github.com/trending/python'),
]

TOP_N = 3      # 每个分类只看当日前 N 个；跨分类重复直接丢，不从下一名补


def fetch_category(category: str, url: str) -> list:
    """解析当日前 N 个 repo。GitHub trending 无强反爬，普通 Fetcher 即可。"""
    fetcher = Fetcher(auto_match=False)
    page = fetcher.get(url, timeout=30)

    items = []
    # GitHub trending 列表项：article.Box-row，h2 a 是仓库链接
    rows = page.css('article.Box-row')
    for row in rows[:TOP_N]:
        a = row.css_first('h2 a')
        if not a:
            continue
        href = a.attrib.get('href', '').strip()
        if not href.startswith('/'):
            continue
        # href 形如 "/owner/repo"，去掉首斜杠转 owner/repo
        repo = href.lstrip('/').strip()
        # 防御：只保留 owner/repo 形式（不含额外路径）
        if repo.count('/') != 1:
            continue
        items.append({
            'repo': repo,
            'url': f'https://github.com/{repo}',
            'category': category,
        })
    return items


def main():
    """按 all → typescript → python 顺序，跨分类去重：
    一个 repo 只在第一次出现的分类里保留，重复的直接丢；最终条数可少于 9。"""
    all_items = []
    errors = []
    seen_repos = set()
    for category, url in CATEGORIES:
        try:
            candidates = fetch_category(category, url)
        except Exception as e:
            errors.append({'category': category, 'error': str(e)})
            continue
        for it in candidates:
            if it['repo'] in seen_repos:
                continue
            seen_repos.add(it['repo'])
            all_items.append(it)

    now = datetime.now()
    result = {
        'items': all_items,
        'fetchedAt': now.isoformat(),
        'date': now.strftime('%Y-%m-%d'),
    }
    if errors:
        result['errors'] = errors

    if not all_items:
        # 完全失败：以非零退出码返回
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(2)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
