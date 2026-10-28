<?php
/**
 * PHPUnit Bootstrap for ems-route-card-engine
 */

declare(strict_types=1);

require_once dirname( __DIR__ ) . '/vendor/autoload.php';

if ( ! defined( 'EMS_ROUTE_CARD_VERSION' ) ) {
    define( 'EMS_ROUTE_CARD_VERSION', '0.1.0' );
}

if ( ! defined( 'EMS_ROUTE_CARD_FILE' ) ) {
    define( 'EMS_ROUTE_CARD_FILE', dirname( __DIR__ ) . '/ems-route-card-engine.php' );
}

if ( ! defined( 'EMS_ROUTE_CARD_PATH' ) ) {
    define( 'EMS_ROUTE_CARD_PATH', dirname( __DIR__ ) . '/' );
}

if ( ! defined( 'EMS_ROUTE_CARD_URL' ) ) {
    define( 'EMS_ROUTE_CARD_URL', 'https://example.com/wp-content/plugins/ems-route-card-engine/' );
}

if ( ! defined( 'DOFE_DEM_DATA_DIR' ) ) {
    define( 'DOFE_DEM_DATA_DIR', sys_get_temp_dir() . '/dofe-dem-test-data' );
}

if ( ! defined( 'ARRAY_A' ) ) {
    define( 'ARRAY_A', 'ARRAY_A' );
}

if ( ! defined( 'OBJECT' ) ) {
    define( 'OBJECT', 'OBJECT' );
}

if ( ! class_exists( 'WP_REST_Response' ) ) {
    class WP_REST_Response {
        private $data;
        private int $status;
        private array $headers = [];

        public function __construct( $data = null, int $status = 200 ) {
            $this->data   = $data;
            $this->status = $status;
        }

        public function get_data() {
            return $this->data;
        }

        public function get_status(): int {
            return $this->status;
        }

        public function header( string $key, $value ): void {
            $this->headers[ $key ] = $value;
        }

        public function get_headers(): array {
            return $this->headers;
        }
    }
}

if ( ! class_exists( 'WP_Error' ) ) {
    class WP_Error {
        private string $code;
        private string $message;
        private $data;

        public function __construct( string $code = '', string $message = '', $data = '' ) {
            $this->code    = $code;
            $this->message = $message;
            $this->data    = $data;
        }

        public function get_error_code(): string {
            return $this->code;
        }

        public function get_error_message(): string {
            return $this->message;
        }

        public function get_error_data() {
            return $this->data;
        }
    }
}

if ( ! class_exists( 'WP_REST_Request' ) ) {
    class WP_REST_Request {
        private string $method = 'GET';
        private array $params = [];
        private array $headers = [];
        private $body = '';

        public function __construct( string $method = 'GET', string $route = '' ) {
            $this->method = $method;
        }

        public function get_param( string $key ) {
            return $this->params[ $key ] ?? null;
        }

        public function set_param( string $key, $value ): void {
            $this->params[ $key ] = $value;
        }

        public function get_params(): array {
            return $this->params;
        }

        public function set_body( string $body ): void {
            $this->body = $body;
        }

        public function get_body(): string {
            return $this->body;
        }
    }
}
