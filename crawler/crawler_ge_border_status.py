import datetime, html.parser, json, re, sys, urllib.parse, urllib.request

SEARCH_ENGINE_HOSTS = {
    'bing.com', 'www.bing.com',
    'duckduckgo.com', 'html.duckduckgo.com'
}
IGNORED_FILE_EXTENSIONS = {
    '.7z', '.avi', '.csv', '.doc', '.docx', '.gif', '.gz', '.jpeg', '.jpg',
    '.mp3', '.mp4', '.odp', '.ods', '.odt', '.pdf', '.png', '.ppt', '.pptx',
    '.rar', '.rtf', '.tar', '.tgz', '.webp', '.xls', '.xlsx', '.zip'
}
IGNORED_CONTENT_TYPES = {
    'application/msword',
    'application/pdf',
    'application/rtf',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.oasis.opendocument',
    'application/vnd.openxmlformats-officedocument',
    'application/octet-stream',
    'application/x-7z-compressed',
    'application/x-rar-compressed',
    'application/x-tar',
    'application/zip',
    'audio/',
    'image/',
    'text/csv',
    'video/'
}
LOG_PATH = 'ge.log'

class PageExtractor(html.parser.HTMLParser):
    """Parse HTML into visible text, page title, and normalized link records."""

    def __init__(self):
        """Initialize parser state for collected text, links, title, and skipped tags."""
        super().__init__()
        self.parts = []
        self.links = []
        self.skip = 0
        self.in_title = False
        self.title_parts = []
        self.current_link = None
    def handle_starttag(self, tag, attrs):
        """Track title/link boundaries and ignore non-content tags while parsing."""
        tag = tag.lower()
        attrs_dict = {k.lower(): v for k, v in attrs if k and v}
        if tag in {'script', 'style', 'noscript'}:
            self.skip += 1
            return
        if tag == 'title':
            self.in_title = True
        if tag == 'a' and attrs_dict.get('href'):
            self.current_link = {
                'href': attrs_dict.get('href', ''),
                'title': attrs_dict.get('title') or attrs_dict.get('aria-label') or '',
                'textParts': []
            }
    def handle_endtag(self, tag):
        """Close tracked tags and commit completed anchor metadata to the links list."""
        tag = tag.lower()
        if tag in {'script', 'style', 'noscript'} and self.skip:
            self.skip -= 1
            return
        if tag == 'title':
            self.in_title = False
        if tag == 'a' and self.current_link:
            text = clean_text(' '.join(self.current_link.pop('textParts', [])))
            title = clean_text(self.current_link.get('title') or text)
            self.links.append({'href': self.current_link.get('href', ''), 'title': title, 'text': text})
            self.current_link = None
    def handle_data(self, data):
        """Collect visible text, title text, and anchor text from parser data events."""
        if self.skip:
            return
        text = data.strip()
        if not text:
            return
        if self.in_title:
            self.title_parts.append(text)
        if self.current_link is not None:
            self.current_link['textParts'].append(text)
        self.parts.append(text)

def clean_text(value):
    """Collapse repeated whitespace and return a stripped string value."""
    return re.sub(r'\s+', ' ', str(value or '')).strip()

def extract_page(html_text, base_url):
    """Extract page title, readable text, and deduplicated HTTP links from HTML."""
    parser = PageExtractor()
    parser.feed(html_text)
    text = clean_text(' '.join(parser.parts))
    title = clean_text(' '.join(parser.title_parts))
    links = []
    seen = set()
    for raw in parser.links:
        href = raw.get('href', '')
        absolute = urllib.parse.urljoin(base_url, href)
        unwrapped = unwrap_search_result_url(absolute)
        parsed = urllib.parse.urlparse(unwrapped)
        if parsed.scheme not in {'http', 'https'}:
            continue
        normalized = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', parsed.query, ''))
        if normalized in seen or ignored_resource_url(normalized):
            continue
        seen.add(normalized)
        links.append({'url': normalized, 'title': clean_text(raw.get('title') or raw.get('text') or normalized), 'text': clean_text(raw.get('text'))})
    return title, text, links

def normalize_urls(value):
    """Convert a list or comma-separated URL value into a cleaned URL list."""
    items = value if isinstance(value, list) else str(value or '').split(',')
    return [item.strip() for item in items if item and item.strip()]

def normalize_terms(value):
    """Convert list, comma-separated, or semicolon-separated terms to lowercase tokens."""
    if isinstance(value, list):
        items = value
    else:
        items = re.split(r'[,;]', str(value or ''))
    return [clean_text(item).lower() for item in items if clean_text(item)]

def normalize_queries(value):
    """Convert list, newline-separated, or semicolon-separated queries to cleaned strings."""
    if isinstance(value, list):
        items = value
    else:
        items = re.split(r'[\n;]', str(value or ''))
    return [clean_text(item) for item in items if clean_text(item)]

def host(url):
    """Return a normalized hostname for comparing URLs by site."""
    return urllib.parse.urlparse(url).netloc.lower().removeprefix('www.')

def ignored_resource_url(url):
    """Return whether a URL points to a file type the crawler should not fetch."""
    path = urllib.parse.unquote(urllib.parse.urlparse(url).path).lower()
    return any(path.endswith(extension) for extension in IGNORED_FILE_EXTENSIONS)

def ignored_content_type(content_type):
    """Return whether a response content type is a non-HTML resource."""
    lowered = (content_type or '').lower()
    return any(marker in lowered for marker in IGNORED_CONTENT_TYPES)

def is_search_engine_url(url):
    """Return whether a URL belongs to one of the configured search engine hosts."""
    parsed_host = urllib.parse.urlparse(url).netloc.lower()
    return parsed_host in SEARCH_ENGINE_HOSTS or parsed_host.removeprefix('www.') in {h.removeprefix('www.') for h in SEARCH_ENGINE_HOSTS}

def search_engine_name(url):
    """Map a search-engine URL to a display name used in result metadata."""
    parsed_host = urllib.parse.urlparse(url).netloc.lower()
    if 'bing' in parsed_host:
        return 'Bing'
    if 'duckduckgo' in parsed_host:
        return 'DuckDuckGo'
    return 'SearchEngine'

def same_site(url, seeds):
    """Return whether a URL shares a normalized host with any seed URL."""
    link_host = host(url)
    return any(link_host == host(seed) for seed in seeds)

def blocked(url, patterns):
    """Return whether a URL contains any blocked pattern."""
    lowered = url.lower()
    return any(pattern and pattern in lowered for pattern in patterns)

def unwrap_search_result_url(url):
    """Extract the destination URL from common search-result redirect parameters."""
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    for key in ('q', 'url', 'u'):
        candidate = qs.get(key, [''])[0]
        if candidate.startswith(('http://', 'https://')):
            return urllib.parse.unquote(candidate)
    return url

def make_search_urls(params, queries):
    """Build search-result page URLs for each configured engine and query."""
    engines = normalize_terms(params.get('searchEngines', 'bing,duckduckgo'))
    templates = {
        'bing': ('https://www.bing.com/search?q={query}', 'Bing'),
        'duckduckgo': ('https://html.duckduckgo.com/html?q={query}', 'DuckDuckGo'),
        'ddg': ('https://html.duckduckgo.com/html?q={query}', 'DuckDuckGo')
    }
    urls = []
    for query in queries:
        encoded = urllib.parse.quote_plus(query)
        for engine in engines:
            config = templates.get(engine)
            if config:
                template, label = config
                urls.append({'url': template.format(query=encoded), 'query': query, 'engine': label})
    return urls

def relevance_score(link, terms):
    """Count how many relevance terms appear in a link title, text, or URL."""
    haystack = f"{link.get('title', '')} {link.get('text', '')} {link.get('url', '')}".lower()
    return sum(1 for term in terms if term in haystack)

def int_param(params, names, default):
    """Read an integer parameter from the first present name, falling back to default."""
    for name in names:
        value = params.get(name)
        if value not in (None, ''):
            return int(value)
    return default

def page_relevance_score(page, terms):
    """Count relevance terms in fetched visible page text."""
    return relevance_score({'text': page.get('text', '')}, terms)

def log_page(page, links, search_page, text_score, kept_for_evaluation):
    """Append one fetched page as simple score/url/text output."""
    page_url = page.get('finalUrl') or page.get('url', '')
    text = clean_text(page.get('text', ''))
    with open(LOG_PATH, 'a', encoding='utf-8') as log_file:
        log_file.write(f'{text_score}, {page_url}\n{text}\n')

def fetch_url(url, params, depth, source_url=None, link_title='', source_type='seed'):
    """Fetch one URL and return bounded page text, metadata, extracted links, or an error."""
    fetched_at = datetime.datetime.utcnow().isoformat(timespec='seconds') + 'Z'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla'})
    try:
        with urllib.request.urlopen(req, timeout=int(params.get('requestTimeoutSeconds', 20))) as resp:
            final_url = resp.geturl()
            content_type = resp.headers.get('content-type', '')
            if ignored_resource_url(final_url) or ignored_content_type(content_type):
                return {
                    'url': url,
                    'finalUrl': final_url,
                    'sourceUrl': source_url,
                    'linkTitle': link_title,
                    'sourceType': source_type,
                    'depth': depth,
                    'statusCode': resp.status,
                    'contentType': content_type,
                    'fetchedAtUTC': fetched_at,
                    'success': False,
                    'ignoredResource': True,
                    'error': 'Ignored non-HTML resource'
                }
            raw = resp.read(int(params.get('maxBytesPerUrl', 500000)))
            encoding = resp.headers.get_content_charset() or 'utf-8'
            html_text = raw.decode(encoding, errors='replace')
            page_title, text, links = extract_page(html_text, final_url)
            return {
                'url': url,
                'finalUrl': final_url,
                'sourceUrl': source_url,
                'linkTitle': link_title,
                'sourceType': source_type,
                'depth': depth,
                'pageTitle': page_title,
                'statusCode': resp.status,
                'contentType': content_type,
                'fetchedAtUTC': fetched_at,
                'success': True,
                'text': text[:int(params.get('maxTextCharsPerUrl', 20000))],
                'links': links
            }
    except Exception as exc:
        return {
            'url': url,
            'sourceUrl': source_url,
            'linkTitle': link_title,
            'sourceType': source_type,
            'depth': depth,
            'fetchedAtUTC': fetched_at,
            'success': False,
            'error': f'{type(exc).__name__}: {exc}'
        }

def crawl(params):
    """Run a bounded search-and-site crawl and return fetched pages plus selected links."""
    seeds = normalize_urls(params.get('urls', params.get('url', '')))
    queries = normalize_queries(params.get('searchQueries', ''))
    terms = normalize_terms(params.get('relevantTerms', 'border, crossing, customs, checkpoint, security, statement, announcement, travel, region, conflict, peace, Abkhazia, South Ossetia, Armenia, Azerbaijan, Georgia, Russia, Caucasus'))
    blocked_patterns = normalize_terms(params.get('blockedUrlPatterns', 'facebook.com, instagram.com, youtube.com, t.me, telegram.me, whatsapp, mailto:'))
    max_depth = int_param(params, ('maxCrawlDepth', 'maxDepth', 'max_depth', 'max_deph'), 1)    
    max_links_per_page = int_param(params, ('maxLinksPerPage', 'max_links_per_page'), 1)
    max_search_results_per_page = int_param(params, ('maxSearchResultsPerPage', 'max_search_results_per_page'), 1)
    max_pages = max(len(seeds), int_param(params, ('maxPages', 'max_pages'), 36))
    search_pages = make_search_urls(params, queries)
    pages = []
    discovered = []
    selected = []
    search_results = []
    fetched_count = 0
    evaluated_fetch_count = 0
    discarded_count = 0
    queue = [dict(item, depth=0, sourceUrl=None, linkTitle=item.get('query', ''), sourceType='searchEngine') for item in search_pages]
    queue.extend({'url': url, 'depth': 0, 'sourceUrl': None, 'linkTitle': '', 'sourceType': 'governmentSeed'} for url in seeds)
    visited = set()

    while queue and evaluated_fetch_count < max_pages:
        item = queue.pop(0)
        url = item['url']
        if url in visited or blocked(url, blocked_patterns) or ignored_resource_url(url):
            continue
        visited.add(url)
        page = fetch_url(url, params, item['depth'], item.get('sourceUrl'), item.get('linkTitle', ''), item.get('sourceType', 'seed'))
        fetched_count += 1
        if page.get('ignoredResource'):
            continue
        links = page.pop('links', []) if page.get('success') else []
        page_url = page.get('finalUrl', url)
        search_page = is_search_engine_url(page_url) or item.get('sourceType') == 'searchEngine'
        if not search_page:
            evaluated_fetch_count += 1
        text_score = page_relevance_score(page, terms) if page.get('success') else 0
        kept_for_evaluation = page.get('success') and not search_page and text_score > 1
        log_page(page, links, search_page, text_score, kept_for_evaluation)
        if kept_for_evaluation:
            page['textRelevanceScore'] = text_score
            page['isRelevant'] = True
            pages.append(page)
        elif page.get('success') and not search_page:
            discarded_count += 1
        if not page.get('success') or item['depth'] >= max_depth:
            continue

        candidates = []
        follow_roots = seeds + [page_url]
        for link in links:
            link_url = link['url']
            if blocked(link_url, blocked_patterns) or ignored_resource_url(link_url) or link_url in visited:
                continue
            if search_page:
                if is_search_engine_url(link_url):
                    continue
            elif not same_site(link_url, follow_roots):
                continue
            score = relevance_score(link, terms)
            if score >= 1:
                record = {
                        'sourceUrl': page_url,
                        'url': link_url,
                        'title': link.get('title', ''),
                        'anchorText': link.get('text', ''),
                        'depth': item['depth'] + 1,
                        'sourceType': 'searchResult' if search_page else 'siteCrawl',
                        'searchEngine': search_engine_name(page_url) if search_page else '',
                        'relevanceScore': score,
                        'sourcePageText': page.get('text', '')
                    }
                candidates.append(record)
                if search_page:
                    search_results.append(record)
        candidates.sort(key=lambda rec: (-rec['relevanceScore'], rec['title'], rec['url']))
        limit = max_search_results_per_page if search_page else max_links_per_page
        next_items = []
        for record in candidates[:limit]:
            selected.append(record)
            next_items.append({'url': record['url'], 'depth': record['depth'], 'sourceUrl': record['sourceUrl'], 'linkTitle': record['title'], 'sourceType': record['sourceType']})
        if search_page:
            queue[0:0] = next_items
        else:
            queue.extend(next_items)

    return {
        'script': 'crawler_ge_border_status.py',
        'country': params.get('country', ''),
        'searchEngines': normalize_terms(params.get('searchEngines', 'bing,duckduckgo')),
        'searchQueries': queries,
        'governmentSeedUrls': seeds,
        'fetchedAtUTC': datetime.datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        'maxDepth': max_depth,
        'titleRelevanceTerms': terms,
        'pagesFetched': evaluated_fetch_count,
        'totalFetchAttempts': fetched_count,
        'pagesDiscardedAsIrrelevant': discarded_count,
        'pages': pages,
        'searchResultLinks': search_results[:150],
        'selectedLinks': selected[:150],
        'selectionNote': 'Python first fetches Bing and DuckDuckGo result pages for configured queries, ignores PDF, Office, archive, image, audio, and video resources, follows result links up to maxDepth when at least one relevance term appears in the URL, title, or anchor text, then keeps only fetched non-search pages whose visible text relevance score is greater than 1. Irrelevant fetched pages are discarded before downstream evaluation.'
    }

params = json.load(sys.stdin)
print(json.dumps(crawl(params), ensure_ascii=False, indent=2))
