<?php
/**
 * Self-contained database installer for ems-route-card-engine.
 */

declare(strict_types=1);

namespace EMSRoute\Core;

class Table_Installer {
    public static function install(): void {
        global $wpdb;

        $table_name      = $wpdb->prefix . 'dofe_route_cards';
        $charset_collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE {$table_name} (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            expedition_id BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
            team_id BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
            day_number INT(11) NOT NULL DEFAULT 1,
            route_title VARCHAR(255) NOT NULL DEFAULT '',
            header_data LONGTEXT NULL,
            route_data LONGTEXT NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'draft',
            approved_by BIGINT(20) UNSIGNED NULL,
            approved_at DATETIME NULL,
            pdf_file_path VARCHAR(255) NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            KEY exp_team_day (expedition_id, team_id, day_number)
        ) {$charset_collate};";

        if ( ! function_exists( 'dbDelta' ) ) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }

        dbDelta( $sql );
    }
}
