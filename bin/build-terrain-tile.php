#!/usr/bin/env php
<?php
/**
 * OS Terrain 50 Binary Tile Compilation CLI.
 *
 * Compiles raw OS Terrain 50 ASCII Grid files (.asc or zipped tiles) into
 * 8,000,000-byte headerless row-major binary tiles (int16_le, decimetres).
 *
 * Usage:
 *   php bin/build-terrain-tile.php --square=NT --verify
 *   php bin/build-terrain-tile.php --squares=NT,NN,NS,NY --output-dir=/custom/path
 *   php bin/build-terrain-tile.php --all
 */

declare(strict_types=1);

// Locate autoloader
$autoloadPaths = [
    __DIR__ . '/../vendor/autoload.php',
    __DIR__ . '/../../../vendor/autoload.php',
];

$autoloaderFound = false;
foreach ( $autoloadPaths as $path ) {
    if ( file_exists( $path ) ) {
        require_once $path;
        $autoloaderFound = true;
        break;
    }
}

if ( ! $autoloaderFound ) {
    fwrite( STDERR, "Error: Composer vendor/autoload.php not found. Run 'composer install' first.\n" );
    exit( 1 );
}

use EMSRoute\Core\DEM\Terrain_Tile_Compiler;

// Parse CLI options
$options = getopt( 'h', [
    'help',
    'input::',
    'square::',
    'squares::',
    'all',
    'output-dir::',
    'verify',
] );

if ( isset( $options['h'] ) || isset( $options['help'] ) ) {
    showUsage();
    exit( 0 );
}

// 1. Determine input directory
$defaultInput = '/Users/davidstrachan/downloads/terr50_gagg_gb/data';
$inputDir     = (string) ( $options['input'] ?? ( is_dir( $defaultInput ) ? $defaultInput : '' ) );

if ( empty( $inputDir ) || ! is_dir( $inputDir ) ) {
    fwrite( STDERR, "\033[31mError: Input directory not found. Specify via --input=/path/to/data\033[0m\n" );
    exit( 1 );
}

// 2. Determine output directory
$defaultOutputDir = dirname( __DIR__, 2 ) . '/wordpress-env/wordpress/wp-content/dofe-dem-data';
if ( ! is_dir( dirname( $defaultOutputDir ) ) ) {
    // Fall back to local plugin dem-data directory
    $defaultOutputDir = dirname( __DIR__ ) . '/dem-data';
}
$outputDir = (string) ( $options['output-dir'] ?? $defaultOutputDir );

// 3. Determine squares to compile
$squares = [];

if ( isset( $options['all'] ) ) {
    // Scan input directory for 2-letter square folders
    $entries = scandir( $inputDir ) ?: [];
    foreach ( $entries as $entry ) {
        if ( '.' === $entry || '..' === $entry ) {
            continue;
        }
        if ( is_dir( $inputDir . '/' . $entry ) && 2 === strlen( $entry ) && ctype_alpha( $entry ) ) {
            $squares[] = strtoupper( $entry );
        }
    }
    sort( $squares );
} elseif ( isset( $options['squares'] ) && is_string( $options['squares'] ) ) {
    $rawList = explode( ',', $options['squares'] );
    foreach ( $rawList as $s ) {
        $clean = strtoupper( trim( $s ) );
        if ( ! empty( $clean ) ) {
            $squares[] = $clean;
        }
    }
} elseif ( isset( $options['square'] ) && is_string( $options['square'] ) ) {
    $squares[] = strtoupper( trim( $options['square'] ) );
} else {
    // Default to Scottish Borders / Central Belt / Highlands primary DofE squares
    echo "\033[33mNo square specified. Defaulting to primary DofE expedition squares: NT, NN, NS, NY\033[0m\n";
    $squares = [ 'NT', 'NN', 'NS', 'NY' ];
}

if ( empty( $squares ) ) {
    fwrite( STDERR, "\033[31mError: No valid OS Grid squares identified for compilation.\033[0m\n" );
    exit( 1 );
}

$verify = isset( $options['verify'] );

// Display banner
echo "\n\033[1;36m========================================================\033[0m\n";
echo "\033[1;36m       EMS Route Card Engine: OS Terrain 50 Compiler    \033[0m\n";
echo "\033[1;36m========================================================\033[0m\n";
echo "Input Directory : \033[32m{$inputDir}\033[0m\n";
echo "Output Directory: \033[32m{$outputDir}\033[0m\n";
echo "Target Squares  : \033[33m" . implode( ', ', $squares ) . "\033[0m (" . count( $squares ) . " squares)\n";
echo "Verification    : " . ( $verify ? "\033[32mEnabled\033[0m" : "\033[90mDisabled\033[0m" ) . "\n";
echo "--------------------------------------------------------\n\n";

$compiler = new Terrain_Tile_Compiler();
$successCount = 0;
$failCount    = 0;
$totalStart   = microtime( true );

foreach ( $squares as $square ) {
    $targetFile = rtrim( $outputDir, '/' ) . '/' . $square . '.bin';
    echo "Compiling \033[1;34m[{$square}]\033[0m into " . basename( $targetFile ) . " ...\n";

    try {
        $stats = $compiler->compileSquare(
            $inputDir,
            $square,
            $targetFile,
            function( int $processed, int $total, string $tileName ) {
                $pct = round( ( $processed / $total ) * 100 );
                printf( "\r  \033[90mProgress: %3d%% (%d/%d tiles) - Processing %s\033[0m", $pct, $processed, $total, $tileName );
            }
        );

        echo "\r  \033[32m✓ Ingested {$stats['tiles_found']} tiles\033[0m in {$stats['duration_s']}s (" . number_format( $stats['file_size'] ) . " bytes)\n";
        echo "    Min Elevation: {$stats['min_elevation_m']}m | Max Elevation: {$stats['max_elevation_m']}m\n";
        echo "    MD5 Checksum : \033[90m{$stats['md5']}\033[0m\n";

        if ( $verify ) {
            $bmResult = $compiler->verifyBenchmark( $targetFile, $square );
            if ( null !== $bmResult ) {
                if ( $bmResult['passed'] ) {
                    echo "    \033[32m✓ " . $bmResult['message'] . "\033[0m\n";
                } else {
                    echo "    \033[31m✗ " . $bmResult['message'] . "\033[0m\n";
                }
            } else {
                echo "    \033[90m(No pre-configured summit benchmark for {$square})\033[0m\n";
            }
        }

        echo "\n";
        $successCount++;
    } catch ( Throwable $e ) {
        echo "\r  \033[31m✗ Failed to compile [{$square}]: " . $e->getMessage() . "\033[0m\n\n";
        $failCount++;
    }
}

$totalTime = round( microtime( true ) - $totalStart, 2 );
echo "--------------------------------------------------------\n";
printf( "Completed in %.2fs: \033[32m%d succeeded\033[0m, \033[31m%d failed\033[0m.\n\n", $totalTime, $successCount, $failCount );

exit( $failCount > 0 ? 1 : 0 );

function showUsage(): void {
    echo <<<USAGE

\033[1mUsage:\033[0m
  php bin/build-terrain-tile.php [options]

\033[1mOptions:\033[0m
  --input=<path>        Path to raw OS Terrain 50 data directory (e.g. .../terr50_gagg_gb/data)
  --output-dir=<path>   Destination directory for compiled .bin tiles
  --square=<XX>         Compile a single 100km square (e.g. NT)
  --squares=<XX,YY,...> Compile multiple comma-separated squares (e.g. NT,NN,NS,NY)
  --all                 Compile all 55 UK squares found in the input directory
  --verify              Spot-check elevation against known mountain summits
  -h, --help            Show this help text

\033[1mExamples:\033[0m
  # Compile NT square and verify Arthur's Seat elevation
  php bin/build-terrain-tile.php --square=NT --verify

  # Compile main Scottish DofE expedition squares into custom directory
  php bin/build-terrain-tile.php --squares=NT,NN,NS,NY --output-dir=/path/to/dem-data --verify

  # Compile all UK squares
  php bin/build-terrain-tile.php --all

USAGE;
}
