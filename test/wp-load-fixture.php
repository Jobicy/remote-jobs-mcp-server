<?php
define('DAY_IN_SECONDS', 86400);
define('HOUR_IN_SECONDS', 3600);
define('OBJECT', 'OBJECT');

$now = time();
$GLOBALS['fixture_posts'] = [
    101 => (object) ['ID' => 101, 'post_type' => 'job_listing', 'post_status' => 'publish', 'post_password' => '', 'post_date_gmt' => gmdate('Y-m-d H:i:s', $now - 4 * HOUR_IN_SECONDS), 'post_title' => 'Backend Engineer', 'post_content' => '<p>Full public description</p>', 'post_excerpt' => 'Build APIs', 'post_name' => 'backend-engineer'],
    102 => (object) ['ID' => 102, 'post_type' => 'job_listing', 'post_status' => 'publish', 'post_password' => '', 'post_date_gmt' => gmdate('Y-m-d H:i:s', $now - 5 * HOUR_IN_SECONDS), 'post_title' => 'Platform Engineer', 'post_content' => '<p>Platform work</p>', 'post_excerpt' => '', 'post_name' => 'platform-engineer'],
    103 => (object) ['ID' => 103, 'post_type' => 'job_listing', 'post_status' => 'publish', 'post_password' => '', 'post_date_gmt' => gmdate('Y-m-d H:i:s', $now - 6 * HOUR_IN_SECONDS), 'post_title' => 'Hidden Engineer', 'post_content' => '<p>Secret</p>', 'post_excerpt' => '', 'post_name' => 'hidden-engineer'],
    201 => (object) ['ID' => 201, 'post_type' => 'company', 'post_status' => 'publish', 'post_password' => '', 'post_date_gmt' => gmdate('Y-m-d H:i:s', $now), 'post_title' => 'Example Labs', 'post_content' => '<p>Public company</p>', 'post_excerpt' => 'Example employer', 'post_name' => 'example-labs'],
    202 => (object) ['ID' => 202, 'post_type' => 'company', 'post_status' => 'private', 'post_password' => '', 'post_date_gmt' => gmdate('Y-m-d H:i:s', $now), 'post_title' => 'Private Labs', 'post_content' => 'Private', 'post_excerpt' => '', 'post_name' => 'private-labs'],
];
$GLOBALS['fixture_meta'] = [
    101 => ['_company_id' => 201, '_salary_min' => 100000, '_salary_max' => 150000, '_job_salary_currency' => 'USD', '_job_period' => 'yearly'],
    102 => ['_company_id' => 201], 103 => ['_company_id' => 201, '_exclude_from_api' => '1'],
    201 => ['_company_location' => 'London', '_company_website' => 'https://example.com'],
];
$GLOBALS['fixture_terms'] = [
    'job_listing_region' => [(object) ['term_id' => 1, 'slug' => 'uk', 'name' => '🇬🇧 UK'], (object) ['term_id' => 6, 'slug' => 'emea', 'name' => '🌍 EMEA']],
    'job_listing_category' => [(object) ['term_id' => 2, 'slug' => 'engineering', 'name' => 'Engineering']],
    'job_listing_type' => [(object) ['term_id' => 3, 'slug' => 'full-time', 'name' => 'Full-Time']],
    'job_listing_level' => [(object) ['term_id' => 4, 'slug' => 'senior', 'name' => 'Senior']],
    'company_category' => [(object) ['term_id' => 5, 'slug' => 'technology', 'name' => 'Technology']],
];

class FixtureDb {
    public $prefix = 'wp_';
    public $posts = 'wp_posts';
    public function prepare($sql, ...$values) {
        foreach ($values as $value) $sql = preg_replace('/%[sd]/', is_int($value) ? (string) $value : "'" . addslashes($value) . "'", $sql, 1);
        return $sql;
    }
    public function get_row($sql) {
        return str_contains($sql, "slug = 'software-engineer'") ? (object) ['slug' => 'software-engineer', 'title' => 'Software Engineer',
            'what_does_job_do' => '{"overview":"Build software","main_job_category":"Engineering","key_responsibilities":["Code"]}',
            'skills_and_qualifications' => '{"technical_skills":["PHP"],"soft_skills":["Communication"]}',
            'career_path_tiers' => '[{"title":"Junior"},{"title":"Senior"}]'] : null;
    }
    public function get_results($sql) {
        return str_contains($sql, 'main_job_category') ? [(object) ['slug' => 'backend-engineer', 'title' => 'Backend Engineer',
            'what_does_job_do' => '{"overview":"Build APIs","main_job_category":"Engineering"}',
            'skills_and_qualifications' => '{}', 'career_path_tiers' => '[]']] : [];
    }
}
$wpdb = new FixtureDb();

class WP_Query {
    public $posts = [];
    public function __construct($args = null) { if ($args !== null) $this->query($args); }
    public function query($args) {
        $posts = array_values(array_filter($GLOBALS['fixture_posts'], static function ($post) use ($args) {
            if ($post->post_type !== $args['post_type'] || $post->post_status !== 'publish') return false;
            if (in_array($post->ID, $args['post__not_in'] ?? [], true)) return false;
            if ($post->post_password || ($GLOBALS['fixture_meta'][$post->ID]['_exclude_from_api'] ?? '') === '1') return false;
            if (isset($args['meta_query'])) {
                foreach ($args['meta_query'] as $condition) {
                    if (($condition['key'] ?? '') === '_company_id' && ($GLOBALS['fixture_meta'][$post->ID]['_company_id'] ?? 0) !== $condition['value']) return false;
                }
            }
            return true;
        }));
        usort($posts, static function ($a, $b) { return strcmp($b->post_date_gmt, $a->post_date_gmt) ?: $b->ID <=> $a->ID; });
        if (isset($GLOBALS['fixture_filter'])) {
            $clauses = $GLOBALS['fixture_filter'](['where' => '', 'orderby' => ''], $this);
            if (preg_match('/post_date_gmt < \'([^\']+)\'.*ID < ([0-9]+)/', $clauses['where'], $match)) {
                $posts = array_values(array_filter($posts, static function ($post) use ($match) {
                    return strcmp($post->post_date_gmt, $match[1]) < 0 || ($post->post_date_gmt === $match[1] && $post->ID < (int) $match[2]);
                }));
            }
        }
        $this->posts = array_slice($posts, 0, $args['posts_per_page']);
    }
}

function add_filter($name, $callback) { $GLOBALS['fixture_filter'] = $callback; }
function remove_filter($name, $callback) { unset($GLOBALS['fixture_filter']); }
function wp_json_encode($value, $flags = 0) { return json_encode($value, $flags); }
function wp_unslash($value) { return $value; }
function sanitize_text_field($value) { return strip_tags($value); }
function get_post($id) { return is_object($id) ? $id : ($GLOBALS['fixture_posts'][$id] ?? null); }
function get_post_status($id) { return get_post($id)->post_status ?? false; }
function get_post_meta($id, $key) { return $GLOBALS['fixture_meta'][$id][$key] ?? ''; }
function get_the_title($id) { return get_post($id)->post_title ?? ''; }
function get_permalink($id) { return 'https://jobicy.com/' . get_post($id)->post_name; }
function get_the_post_thumbnail_url($id, $size) { return false; }
function get_the_terms($id, $taxonomy) { return $GLOBALS['fixture_terms'][$taxonomy] ?? []; }
function get_terms($args) { return $GLOBALS['fixture_terms'][$args['taxonomy']] ?? []; }
function wp_get_post_terms($id, $taxonomy, $args) { return array_map(static function ($term) { return $term->term_id; }, $GLOBALS['fixture_terms'][$taxonomy] ?? []); }
function is_wp_error($value) { return false; }
function wp_list_pluck($array, $key) { return array_map(static function ($item) use ($key) { return $item->$key; }, $array); }
function wp_strip_all_tags($value) { return strip_tags($value); }
function wp_trim_words($value, $count) { return implode(' ', array_slice(explode(' ', $value), 0, $count)); }
function mysql2date($format, $date) { return gmdate('c', strtotime($date . ' UTC')); }
function term_exists($slug, $taxonomy) { foreach ($GLOBALS['fixture_terms'][$taxonomy] ?? [] as $term) if ($term->slug === $slug) return $term->term_id; return false; }
function get_term_by($field, $value, $taxonomy) { foreach ($GLOBALS['fixture_terms'][$taxonomy] ?? [] as $term) if ($term->$field === $value) return $term; return false; }
function get_ancestors() { return []; }
function get_posts($args) { $query = new WP_Query(); $query->query($args); return $query->posts; }
function get_page_by_path($slug, $output, $type) { foreach ($GLOBALS['fixture_posts'] as $post) if ($post->post_name === $slug && $post->post_type === $type) return $post; return null; }
function sanitize_title($value) { return strtolower(preg_replace('/[^a-z0-9-]+/', '-', $value)); }
function wp_http_validate_url($value) { return filter_var($value, FILTER_VALIDATE_URL); }
function esc_url_raw($value) { return $value; }
function home_url($path) { return 'https://jobicy.com' . $path; }
function wp_salt($type) { return 'fixture-secret'; }
