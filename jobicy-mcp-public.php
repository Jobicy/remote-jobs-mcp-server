<?php
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'");
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60');
require_once dirname(__DIR__, 2) . '/wp-load.php';

const JOBICY_MCP_CURSOR_TTL = DAY_IN_SECONDS;
const JOBICY_MCP_WINDOW = 7 * DAY_IN_SECONDS;

function jobicy_mcp_fail($code, $message, $status = 400) {
    http_response_code($status);
    header('Cache-Control: private, no-store, max-age=0');
    echo wp_json_encode(['error' => ['code' => $code, 'message' => $message]]);
    exit;
}

function jobicy_mcp_send($data) {
    echo wp_json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jobicy_mcp_param($key, $max = 120) {
    if (!isset($_GET[$key])) return null;
    if (!is_string($_GET[$key]) || strlen($_GET[$key]) > $max) jobicy_mcp_fail('INVALID_ARGUMENT', "Invalid $key.");
    return trim(sanitize_text_field(wp_unslash($_GET[$key])));
}

function jobicy_mcp_id($key) {
    $raw = jobicy_mcp_param($key, 20);
    if ($raw === null || !preg_match('/^[1-9][0-9]{0,15}$/D', $raw)) jobicy_mcp_fail('INVALID_ARGUMENT', "Invalid $key.");
    return (int) $raw;
}

function jobicy_mcp_limit($max, $default) {
    $raw = jobicy_mcp_param('limit', 3);
    if ($raw === null) return $default;
    if (!preg_match('/^[1-9][0-9]*$/D', $raw) || (int) $raw > $max) jobicy_mcp_fail('INVALID_ARGUMENT', "limit must be between 1 and $max.");
    return (int) $raw;
}

function jobicy_mcp_length($value) {
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : preg_match_all('/./us', $value);
}

function jobicy_mcp_location_label($value) {
    $label = html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $label = preg_replace('/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0E}\x{FE0F}\x{200D}\x{20E3}]/u', '', $label);
    return trim(preg_replace('/\s+/u', ' ', $label));
}

function jobicy_mcp_terms($post_id, $taxonomy) {
    $terms = get_the_terms($post_id, $taxonomy);
    return is_array($terms) ? array_values(array_map(static function ($term) use ($taxonomy) {
        return $taxonomy === 'job_listing_region'
            ? jobicy_mcp_location_label($term->name)
            : html_entity_decode($term->name, ENT_QUOTES, 'UTF-8');
    }, $terms)) : [];
}

function jobicy_mcp_visible_job($post, $now) {
    return $post && $post->post_type === 'job_listing' && $post->post_status === 'publish' && !$post->post_password &&
        (string) get_post_meta($post->ID, '_exclude_from_api', true) !== '1' &&
        strtotime($post->post_date_gmt . ' UTC') >= $now - JOBICY_MCP_WINDOW &&
        strtotime($post->post_date_gmt . ' UTC') <= $now - 3 * HOUR_IN_SECONDS;
}

function jobicy_mcp_job($post, $full = false) {
    $id = (int) $post->ID;
    $company_id = (int) get_post_meta($id, '_company_id', true);
    $company = $company_id && get_post_status($company_id) === 'publish' ? get_post($company_id) : null;
    $regions = jobicy_mcp_terms($id, 'job_listing_region');
    $levels = jobicy_mcp_terms($id, 'job_listing_level');
    $item = [
        'id' => $id,
        'url' => get_permalink($id),
        'jobTitle' => html_entity_decode(get_the_title($id), ENT_QUOTES, 'UTF-8'),
        'companyName' => $company ? get_the_title($company) : '',
        'jobIndustry' => jobicy_mcp_terms($id, 'job_listing_category'),
        'jobType' => jobicy_mcp_terms($id, 'job_listing_type'),
        'jobGeo' => $regions ? implode(', ', $regions) : 'Anywhere',
        'jobLevel' => $levels ? implode(', ', $levels) : 'Any',
        'jobExcerpt' => $post->post_excerpt ?: wp_trim_words(wp_strip_all_tags($post->post_content), 55),
        'pubDate' => mysql2date('c', $post->post_date_gmt, false),
    ];
    $logo = get_the_post_thumbnail_url($id, 'full');
    if ($logo) $item['companyLogo'] = $logo;
    if ($company) $item['companyId'] = $company_id;
    $salary_min = get_post_meta($id, '_salary_min', true);
    $salary_max = get_post_meta($id, '_salary_max', true);
    if (is_numeric($salary_min) && $salary_min !== '') $item['salaryMin'] = (float) $salary_min;
    if (is_numeric($salary_max) && $salary_max !== '') $item['salaryMax'] = (float) $salary_max;
    if (isset($item['salaryMin']) || isset($item['salaryMax'])) {
        $currency = get_post_meta($id, '_job_salary_currency', true);
        $period = get_post_meta($id, '_job_period', true);
        if ($currency !== '') $item['salaryCurrency'] = (string) $currency;
        if ($period !== '') $item['salaryPeriod'] = (string) $period;
    }
    if ($full) $item['jobDescription'] = $post->post_content;
    return $item;
}

function jobicy_mcp_company($post, $full = false) {
    $id = (int) $post->ID;
    $data = [
        'id' => $id,
        'slug' => $post->post_name,
        'name' => html_entity_decode(get_the_title($id), ENT_QUOTES, 'UTF-8'),
        'url' => get_permalink($id),
        'industry' => jobicy_mcp_terms($id, 'company_category'),
    ];
    $logo = get_the_post_thumbnail_url($id, 'full');
    if ($logo) $data['logo'] = $logo;
    $location = get_post_meta($id, '_company_location', true);
    if ($location !== '') $data['location'] = (string) $location;
    if ($full) {
        $data['description'] = $post->post_content;
        $website = get_post_meta($id, '_company_website', true);
        if ($website && wp_http_validate_url($website)) $data['website'] = esc_url_raw($website);
    } else {
        $data['excerpt'] = $post->post_excerpt ?: wp_trim_words(wp_strip_all_tags($post->post_content), 35);
    }
    return $data;
}

function jobicy_mcp_cursor_encode($snapshot, $post, $hash) {
    $payload = rtrim(strtr(base64_encode(wp_json_encode([
        'v' => 1, 't' => $snapshot, 'd' => $post->post_date_gmt, 'i' => (int) $post->ID, 'f' => $hash,
    ])), '+/', '-_'), '=');
    return $payload . '.' . hash_hmac('sha256', 'jobicy-mcp-public-v1|' . $payload, wp_salt('auth'));
}

function jobicy_mcp_cursor_decode($cursor, $hash, $now) {
    if (!preg_match('/^([A-Za-z0-9_-]{20,400})\.([a-f0-9]{64})$/D', $cursor, $match)) jobicy_mcp_fail('INVALID_ARGUMENT', 'Invalid cursor.');
    $signature = hash_hmac('sha256', 'jobicy-mcp-public-v1|' . $match[1], wp_salt('auth'));
    if (!hash_equals($signature, $match[2])) jobicy_mcp_fail('INVALID_ARGUMENT', 'Invalid cursor signature.');
    $decoded = base64_decode(strtr($match[1], '-_', '+/') . str_repeat('=', (4 - strlen($match[1]) % 4) % 4), true);
    $data = $decoded === false ? null : json_decode($decoded, true);
    if (!is_array($data) || ($data['v'] ?? null) !== 1 || !is_int($data['t'] ?? null) || !is_int($data['i'] ?? null) ||
        $data['i'] < 1 || !is_string($data['d'] ?? null) || !preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/D', $data['d']) ||
        !is_string($data['f'] ?? null) || !hash_equals($hash, $data['f'])) jobicy_mcp_fail('INVALID_ARGUMENT', 'Cursor does not match the filters.');
    if ($data['t'] > $now || $data['t'] <= $now - JOBICY_MCP_CURSOR_TTL) jobicy_mcp_fail('INVALID_ARGUMENT', 'Cursor expired.');
    return $data;
}

function jobicy_mcp_page($args, $limit, $filters) {
    global $wpdb;
    $now = time();
    $hash = hash('sha256', wp_json_encode($filters));
    $cursor_raw = jobicy_mcp_param('cursor', 500);
    $position = $cursor_raw === null ? null : jobicy_mcp_cursor_decode($cursor_raw, $hash, $now);
    $snapshot = $position ? $position['t'] : $now;
    $args['posts_per_page'] = $limit + 1;
    $args['no_found_rows'] = true;
    $args['ignore_sticky_posts'] = true;
    $args['orderby'] = ['date' => 'DESC', 'ID' => 'DESC'];
    $args['suppress_filters'] = false;
    $query = new WP_Query();
    $filter = static function ($clauses, $current) use ($query, $wpdb, $now, $snapshot, $position) {
        if ($current !== $query) return $clauses;
        $clauses['where'] .= $wpdb->prepare(" AND {$wpdb->posts}.post_date_gmt >= %s AND {$wpdb->posts}.post_date_gmt <= %s",
            gmdate('Y-m-d H:i:s', $now - JOBICY_MCP_WINDOW), gmdate('Y-m-d H:i:s', $snapshot - 3 * HOUR_IN_SECONDS));
        if ($position) $clauses['where'] .= $wpdb->prepare(
            " AND ({$wpdb->posts}.post_date_gmt < %s OR ({$wpdb->posts}.post_date_gmt = %s AND {$wpdb->posts}.ID < %d))",
            $position['d'], $position['d'], $position['i']);
        $clauses['orderby'] = "{$wpdb->posts}.post_date_gmt DESC, {$wpdb->posts}.ID DESC";
        return $clauses;
    };
    add_filter('posts_clauses', $filter, PHP_INT_MAX, 2);
    try { $query->query($args); } finally { remove_filter('posts_clauses', $filter, PHP_INT_MAX); }
    $posts = array_slice($query->posts, 0, $limit);
    $more = count($query->posts) > $limit;
    return ['posts' => $posts, 'nextCursor' => $more && $posts ? jobicy_mcp_cursor_encode($snapshot, end($posts), $hash) : null, 'hasMore' => $more];
}

function jobicy_mcp_job_query($filters) {
    $args = ['post_type' => 'job_listing', 'post_status' => 'publish', 'has_password' => false, 'meta_query' => [
        'relation' => 'AND', ['relation' => 'OR', ['key' => '_exclude_from_api', 'compare' => 'NOT EXISTS'], ['key' => '_exclude_from_api', 'value' => '1', 'compare' => '!=']],
    ], 'tax_query' => ['relation' => 'AND']];
    if ($filters['query'] !== '') $args['s'] = $filters['query'];
    if ($filters['industry'] !== '') $args['tax_query'][] = ['taxonomy' => 'job_listing_category', 'field' => 'slug', 'terms' => $filters['industry'], 'include_children' => true];
    if ($filters['jobType'] !== '') $args['tax_query'][] = ['taxonomy' => 'job_listing_type', 'field' => 'slug', 'terms' => $filters['jobType']];
    if ($filters['jobLevel'] !== '') $args['tax_query'][] = ['taxonomy' => 'job_listing_level', 'field' => 'slug', 'terms' => $filters['jobLevel']];
    if ($filters['geo'] !== '') {
        $geo = $filters['geo'];
        $term = get_term_by('slug', $geo, 'job_listing_region');
        $or = ['relation' => 'OR', ['taxonomy' => 'job_listing_region', 'field' => 'slug', 'terms' => $geo, 'include_children' => true],
            ['taxonomy' => 'job_listing_region', 'operator' => 'NOT EXISTS']];
        if ($term && !is_wp_error($term)) {
            $ancestors = get_ancestors($term->term_id, 'job_listing_region', 'taxonomy');
            if ($ancestors) $or[] = ['taxonomy' => 'job_listing_region', 'field' => 'term_id', 'terms' => $ancestors, 'include_children' => false];
        }
        $args['tax_query'][] = $or;
    }
    if ($filters['company'] > 0) $args['meta_query'][] = ['key' => '_company_id', 'value' => $filters['company'], 'compare' => '='];
    if ($filters['postedAfter'] !== '') $args['date_query'] = [['after' => $filters['postedAfter'], 'inclusive' => true, 'column' => 'post_date_gmt']];
    if ($filters['salaryMin'] !== null) $args['meta_query'][] = ['key' => '_salary_max', 'value' => $filters['salaryMin'], 'compare' => '>=', 'type' => 'NUMERIC'];
    if ($filters['salaryMax'] !== null) $args['meta_query'][] = ['key' => '_salary_min', 'value' => $filters['salaryMax'], 'compare' => '<=', 'type' => 'NUMERIC'];
    if ($filters['currency'] !== '') $args['meta_query'][] = ['key' => '_job_salary_currency', 'value' => $filters['currency'], 'compare' => '='];
    return $args;
}

function jobicy_mcp_search_filters() {
    $filters = [];
    foreach (['query', 'geo', 'industry', 'jobType', 'jobLevel', 'postedAfter', 'currency'] as $key) $filters[$key] = jobicy_mcp_param($key, $key === 'query' ? 80 : 50) ?? '';
    foreach (['geo' => 'job_listing_region', 'industry' => 'job_listing_category', 'jobType' => 'job_listing_type', 'jobLevel' => 'job_listing_level'] as $key => $taxonomy) {
        if ($filters[$key] !== '' && (!preg_match('/^[a-z0-9-]+$/D', $filters[$key]) || !term_exists($filters[$key], $taxonomy))) jobicy_mcp_fail('INVALID_ARGUMENT', "Unknown $key slug.");
    }
    if ($filters['query'] !== '' && jobicy_mcp_length($filters['query']) < 3) jobicy_mcp_fail('INVALID_ARGUMENT', 'query must have at least 3 characters.');
    if ($filters['postedAfter'] !== '' && (!preg_match('/^\d{4}-\d\d-\d\d$/D', $filters['postedAfter']) || date('Y-m-d', strtotime($filters['postedAfter'])) !== $filters['postedAfter'])) jobicy_mcp_fail('INVALID_ARGUMENT', 'postedAfter must be YYYY-MM-DD.');
    $filters['currency'] = strtoupper($filters['currency']);
    if ($filters['currency'] !== '' && !preg_match('/^[A-Z]{3}$/D', $filters['currency'])) jobicy_mcp_fail('INVALID_ARGUMENT', 'Invalid currency.');
    $company = jobicy_mcp_param('company', 20);
    $filters['company'] = $company === null ? 0 : (preg_match('/^[1-9][0-9]{0,15}$/D', $company) ? (int) $company : 0);
    if ($company !== null && !$filters['company']) jobicy_mcp_fail('INVALID_ARGUMENT', 'company must be a public company ID.');
    foreach (['salaryMin', 'salaryMax'] as $key) {
        $raw = jobicy_mcp_param($key, 10);
        $filters[$key] = $raw === null ? null : (ctype_digit($raw) && (int) $raw <= 100000000 ? (int) $raw : -1);
        if ($filters[$key] === -1) jobicy_mcp_fail('INVALID_ARGUMENT', "Invalid $key.");
    }
    if ($filters['salaryMin'] !== null && $filters['salaryMax'] !== null && $filters['salaryMin'] > $filters['salaryMax']) jobicy_mcp_fail('INVALID_ARGUMENT', 'salaryMin exceeds salaryMax.');
    return $filters;
}

function jobicy_mcp_role($row) {
    $overview = json_decode($row->what_does_job_do, true) ?: [];
    $skills = json_decode($row->skills_and_qualifications, true) ?: [];
    $tiers = json_decode($row->career_path_tiers, true) ?: [];
    return [
        'slug' => $row->slug, 'title' => $row->title, 'url' => home_url('/careers/' . $row->slug),
        'description' => $overview['overview'] ?? '',
        'responsibilities' => array_values($overview['key_responsibilities'] ?? []),
        'skills' => array_values(array_merge($skills['technical_skills'] ?? [], $skills['soft_skills'] ?? [])),
        'levels' => array_values(array_filter(array_map(static function ($tier) { return is_array($tier) ? (string) ($tier['title'] ?? '') : ''; }, $tiers))),
        'category' => $overview['main_job_category'] ?? '',
    ];
}

$action = jobicy_mcp_param('action', 40);
$allowed = [
    'search_jobs' => ['action','query','geo','industry','jobType','jobLevel','company','postedAfter','salaryMin','salaryMax','currency','limit','cursor'],
    'get_job' => ['action','id'], 'get_similar_jobs' => ['action','jobId','limit'],
    'search_companies' => ['action','query','industry','geo','limit'], 'get_company' => ['action','id'],
    'get_company_jobs' => ['action','companyId','limit','cursor'], 'get_role' => ['action','role'],
    'get_related_roles' => ['action','role','limit'], 'list_taxonomies' => ['action','type'],
];
if (!isset($allowed[$action])) jobicy_mcp_fail('INVALID_ARGUMENT', 'Unknown action.');
foreach (array_keys($_GET) as $key) if (!in_array($key, $allowed[$action], true)) jobicy_mcp_fail('INVALID_ARGUMENT', "Unexpected parameter $key.");
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET' || !empty($_SERVER['HTTP_AUTHORIZATION'])) jobicy_mcp_fail('INVALID_ARGUMENT', 'Public GET requests only.');

if ($action === 'search_jobs' || $action === 'get_company_jobs') {
    $filters = $action === 'search_jobs' ? jobicy_mcp_search_filters() : ['company' => jobicy_mcp_id('companyId')];
    if ($action === 'get_company_jobs') {
        $company = get_post($filters['company']);
        if (!$company || $company->post_type !== 'company' || $company->post_status !== 'publish' || $company->post_password) jobicy_mcp_fail('NOT_FOUND', 'Company not found.', 404);
    }
    $limit = jobicy_mcp_limit(50, 20);
    $page = jobicy_mcp_page(jobicy_mcp_job_query($action === 'search_jobs' ? $filters : array_merge(array_fill_keys(['query','geo','industry','jobType','jobLevel','postedAfter','currency'], ''), ['company' => $filters['company'], 'salaryMin' => null, 'salaryMax' => null])), $limit, ['action' => $action, 'filters' => $filters]);
    $jobs = array_map('jobicy_mcp_job', $page['posts']);
    jobicy_mcp_send(['jobs' => $jobs, 'jobCount' => count($jobs), 'nextCursor' => $page['nextCursor'], 'hasMore' => $page['hasMore'], 'appliedFilters' => $filters]);
}

if ($action === 'get_job' || $action === 'get_similar_jobs') {
    $post = get_post(jobicy_mcp_id($action === 'get_job' ? 'id' : 'jobId'));
    if (!jobicy_mcp_visible_job($post, time())) jobicy_mcp_fail('NOT_FOUND', 'Job not found.', 404);
    if ($action === 'get_job') jobicy_mcp_send(['job' => jobicy_mcp_job($post, true)]);
    $limit = jobicy_mcp_limit(10, 5);
    $industries = wp_get_post_terms($post->ID, 'job_listing_category', ['fields' => 'ids']);
    $types = wp_get_post_terms($post->ID, 'job_listing_type', ['fields' => 'ids']);
    $levels = wp_get_post_terms($post->ID, 'job_listing_level', ['fields' => 'ids']);
    $regions = wp_get_post_terms($post->ID, 'job_listing_region', ['fields' => 'ids']);
    foreach (['industries', 'types', 'levels', 'regions'] as $name) if (is_wp_error($$name)) $$name = [];
    $query = new WP_Query(['post_type' => 'job_listing', 'post_status' => 'publish', 'has_password' => false, 'post__not_in' => [$post->ID],
        'posts_per_page' => 80, 'no_found_rows' => true, 'date_query' => [['after' => gmdate('Y-m-d H:i:s', time() - JOBICY_MCP_WINDOW), 'before' => gmdate('Y-m-d H:i:s', time() - 3 * HOUR_IN_SECONDS), 'column' => 'post_date_gmt']],
        'tax_query' => $industries ? [['taxonomy' => 'job_listing_category', 'field' => 'term_id', 'terms' => $industries]] : [],
        'meta_query' => [['relation' => 'OR', ['key' => '_exclude_from_api', 'compare' => 'NOT EXISTS'], ['key' => '_exclude_from_api', 'value' => '1', 'compare' => '!=']]]]);
    $words = preg_split('/[^\pL\pN]+/u', strtolower($post->post_title), -1, PREG_SPLIT_NO_EMPTY);
    $ranked = [];
    foreach ($query->posts as $candidate) {
        $score = 3 * count(array_intersect((array) $industries, wp_get_post_terms($candidate->ID, 'job_listing_category', ['fields' => 'ids']))) +
            2 * count(array_intersect((array) $types, wp_get_post_terms($candidate->ID, 'job_listing_type', ['fields' => 'ids']))) +
            2 * count(array_intersect((array) $levels, wp_get_post_terms($candidate->ID, 'job_listing_level', ['fields' => 'ids']))) +
            count(array_intersect((array) $regions, wp_get_post_terms($candidate->ID, 'job_listing_region', ['fields' => 'ids'])));
        $candidate_words = preg_split('/[^\pL\pN]+/u', strtolower($candidate->post_title), -1, PREG_SPLIT_NO_EMPTY);
        $score += 2 * count(array_intersect(array_unique($words), array_unique($candidate_words)));
        if ($score > 0) $ranked[] = ['post' => $candidate, 'score' => $score];
    }
    usort($ranked, static function ($a, $b) { return $b['score'] <=> $a['score'] ?: strcmp($b['post']->post_date_gmt, $a['post']->post_date_gmt) ?: $b['post']->ID <=> $a['post']->ID; });
    $jobs = [];
    foreach (array_slice($ranked, 0, $limit) as $entry) {
        $job = jobicy_mcp_job($entry['post']);
        $job['similarityScore'] = $entry['score'];
        $jobs[] = $job;
    }
    jobicy_mcp_send(['jobs' => $jobs]);
}

if ($action === 'search_companies' || $action === 'get_company') {
    if ($action === 'get_company') {
        $id = jobicy_mcp_param('id', 120);
        $post = ctype_digit((string) $id) ? get_post((int) $id) : get_page_by_path(sanitize_title($id), OBJECT, 'company');
        if (!$post || $post->post_type !== 'company' || $post->post_status !== 'publish' || $post->post_password) jobicy_mcp_fail('NOT_FOUND', 'Company not found.', 404);
        jobicy_mcp_send(['company' => jobicy_mcp_company($post, true)]);
    }
    $query_text = jobicy_mcp_param('query', 80) ?? '';
    $industry = jobicy_mcp_param('industry', 50) ?? '';
    $geo = jobicy_mcp_param('geo', 80) ?? '';
    if ($query_text === '' && $industry === '' && $geo === '') jobicy_mcp_fail('INVALID_ARGUMENT', 'Specify query, industry, or geo.');
    if ($query_text !== '' && jobicy_mcp_length($query_text) < 3) jobicy_mcp_fail('INVALID_ARGUMENT', 'query must have at least 3 characters.');
    if ($geo !== '' && jobicy_mcp_length($geo) < 3) jobicy_mcp_fail('INVALID_ARGUMENT', 'geo must have at least 3 characters.');
    if ($industry !== '' && (!preg_match('/^[a-z0-9-]+$/D', $industry) || !term_exists($industry, 'company_category'))) jobicy_mcp_fail('INVALID_ARGUMENT', 'Unknown company industry slug.');
    $args = ['post_type' => 'company', 'post_status' => 'publish', 'has_password' => false, 'posts_per_page' => jobicy_mcp_limit(10, 10), 'no_found_rows' => true];
    if ($query_text !== '') $args['s'] = $query_text;
    if ($industry !== '') $args['tax_query'] = [['taxonomy' => 'company_category', 'field' => 'slug', 'terms' => $industry]];
    if ($geo !== '') $args['meta_query'] = [['key' => '_company_location', 'value' => $geo, 'compare' => 'LIKE']];
    $posts = get_posts($args);
    jobicy_mcp_send(['companies' => array_map('jobicy_mcp_company', $posts)]);
}

if ($action === 'get_role' || $action === 'get_related_roles') {
    global $wpdb;
    $slug = jobicy_mcp_param('role', 100);
    if (!$slug || !preg_match('/^[a-z0-9-]+$/D', $slug)) jobicy_mcp_fail('INVALID_ARGUMENT', 'Invalid role slug.');
    $table = $wpdb->prefix . 'career_paths';
    $row = $wpdb->get_row($wpdb->prepare("SELECT slug,title,what_does_job_do,skills_and_qualifications,career_path_tiers FROM {$table} WHERE slug = %s LIMIT 1", $slug));
    if (!$row) jobicy_mcp_fail('NOT_FOUND', 'Role not found.', 404);
    $category = (json_decode($row->what_does_job_do, true) ?: [])['main_job_category'] ?? '';
    $limit = $action === 'get_role' ? 5 : jobicy_mcp_limit(10, 5);
    $related = $category === '' ? [] : $wpdb->get_results($wpdb->prepare("SELECT slug,title,what_does_job_do,skills_and_qualifications,career_path_tiers FROM {$table} WHERE JSON_UNQUOTE(JSON_EXTRACT(what_does_job_do, '$.main_job_category')) = %s AND slug <> %s ORDER BY title ASC LIMIT %d", $category, $slug, $limit));
    if ($action === 'get_role') {
        $data = jobicy_mcp_role($row);
        $data['relatedRoles'] = array_values(array_map(static function ($item) { return ['slug' => $item->slug, 'title' => $item->title, 'url' => home_url('/careers/' . $item->slug)]; }, $related));
        jobicy_mcp_send(['role' => $data]);
    }
    jobicy_mcp_send(['roles' => array_map('jobicy_mcp_role', $related)]);
}

if ($action === 'list_taxonomies') {
    $type = jobicy_mcp_param('type', 30);
    $map = ['locations' => 'job_listing_region', 'industries' => 'job_listing_category', 'job_types' => 'job_listing_type', 'job_levels' => 'job_listing_level'];
    if (!isset($map[$type])) jobicy_mcp_fail('INVALID_ARGUMENT', 'Unknown taxonomy type.');
    $terms = get_terms(['taxonomy' => $map[$type], 'hide_empty' => false]);
    if (is_wp_error($terms)) jobicy_mcp_fail('UPSTREAM_ERROR', 'Could not load taxonomy.', 503);
    jobicy_mcp_send(['type' => $type, 'terms' => array_values(array_map(static function ($term) use ($type) {
        return ['slug' => $term->slug, 'label' => $type === 'locations'
            ? jobicy_mcp_location_label($term->name)
            : html_entity_decode($term->name, ENT_QUOTES, 'UTF-8')];
    }, $terms))]);
}
