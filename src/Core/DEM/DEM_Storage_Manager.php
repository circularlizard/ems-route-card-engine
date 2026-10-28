<?php
/**
 * DEM Storage Manager.
 *
 * Manages the DOFE_DEM_DATA_DIR directory, listing available binary tiles,
 * validating file sizes, running benchmark spot-checks, and handling tile uploads and deletions.
 */

declare(strict_types=1);

namespace EMSRoute\Core\DEM;

use RuntimeException;
use InvalidArgumentException;
use ZipArchive;

class DEM_Storage_Manager {
    /**
     * Standard 55 Ordnance Survey 100km grid squares covering Great Britain.
     *
     * @var array<string, array{name: string, region: string, dfe_priority: bool}>
     */
    public const UK_GRID_SQUARES = [
        // Scotland (Highlands & Islands, Borders, Central Belt)
        'HP' => [ 'name' => 'Shetland (North)', 'region' => 'Scotland', 'dfe_priority' => false ],
        'HT' => [ 'name' => 'Shetland (Outlying)', 'region' => 'Scotland', 'dfe_priority' => false ],
        'HU' => [ 'name' => 'Shetland (Mainland)', 'region' => 'Scotland', 'dfe_priority' => false ],
        'HW' => [ 'name' => 'Orkney (West)', 'region' => 'Scotland', 'dfe_priority' => false ],
        'HX' => [ 'name' => 'Orkney (North)', 'region' => 'Scotland', 'dfe_priority' => false ],
        'HY' => [ 'name' => 'Orkney (East)', 'region' => 'Scotland', 'dfe_priority' => false ],
        'HZ' => [ 'name' => 'Fair Isle', 'region' => 'Scotland', 'dfe_priority' => false ],
        'NA' => [ 'name' => 'Outer Hebrides (North)', 'region' => 'Scotland', 'dfe_priority' => false ],
        'NB' => [ 'name' => 'Lewis & Harris', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NC' => [ 'name' => 'Sutherland / Durness', 'region' => 'Scotland', 'dfe_priority' => true ],
        'ND' => [ 'name' => 'Caithness / John o\' Groats', 'region' => 'Scotland', 'dfe_priority' => false ],
        'NF' => [ 'name' => 'Uist / Benbecula', 'region' => 'Scotland', 'dfe_priority' => false ],
        'NG' => [ 'name' => 'Skye & Wester Ross', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NH' => [ 'name' => 'Inverness & Cairngorms (West)', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NJ' => [ 'name' => 'Moray & Speyside', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NK' => [ 'name' => 'Peterhead / Buchan', 'region' => 'Scotland', 'dfe_priority' => false ],
        'NL' => [ 'name' => 'Barra & South Uist', 'region' => 'Scotland', 'dfe_priority' => false ],
        'NM' => [ 'name' => 'Mull, Ardnamurchan & Oban', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NN' => [ 'name' => 'Fort William, Ben Nevis & Cairngorms', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NO' => [ 'name' => 'Dundee, Angus & Deeside', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NR' => [ 'name' => 'Islay, Jura & Kintyre', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NS' => [ 'name' => 'Glasgow, Loch Lomond & Ayrshire', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NT' => [ 'name' => 'Edinburgh & Scottish Borders', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NU' => [ 'name' => 'Berwick-upon-Tweed & Lindisfarne', 'region' => 'Northern England', 'dfe_priority' => false ],
        'NW' => [ 'name' => 'Rhinns of Galloway', 'region' => 'Scotland', 'dfe_priority' => false ],
        'NX' => [ 'name' => 'Dumfries & Galloway / Galloway Forest', 'region' => 'Scotland', 'dfe_priority' => true ],
        'NY' => [ 'name' => 'Lake District, Carlisle & Eden Valley', 'region' => 'Northern England', 'dfe_priority' => true ],
        'NZ' => [ 'name' => 'Newcastle, Durham & North Pennines', 'region' => 'Northern England', 'dfe_priority' => true ],
        'OV' => [ 'name' => 'North Sea Coastal / Outlying', 'region' => 'Northern England', 'dfe_priority' => false ],

        // England & Wales
        'SD' => [ 'name' => 'Yorkshire Dales & Forest of Bowland', 'region' => 'Northern England', 'dfe_priority' => true ],
        'SE' => [ 'name' => 'York & North York Moors (West)', 'region' => 'Northern England', 'dfe_priority' => true ],
        'SH' => [ 'name' => 'Snowdonia (Eryri) & Anglesey', 'region' => 'Wales', 'dfe_priority' => true ],
        'SJ' => [ 'name' => 'Cheshire, Liverpool & Wrexham', 'region' => 'North West / Wales', 'dfe_priority' => false ],
        'SK' => [ 'name' => 'Peak District & Sheffield', 'region' => 'Midlands / North', 'dfe_priority' => true ],
        'SM' => [ 'name' => 'Pembrokeshire (St David\'s)', 'region' => 'Wales', 'dfe_priority' => true ],
        'SN' => [ 'name' => 'Cambrian Mountains & Brecon (North)', 'region' => 'Wales', 'dfe_priority' => true ],
        'SO' => [ 'name' => 'Brecon Beacons (Bannau Brycheiniog)', 'region' => 'Wales / Marches', 'dfe_priority' => true ],
        'SP' => [ 'name' => 'Cotswolds (North) & Birmingham', 'region' => 'Midlands', 'dfe_priority' => false ],
        'SR' => [ 'name' => 'Bristol Channel (South)', 'region' => 'South West', 'dfe_priority' => false ],
        'SS' => [ 'name' => 'Exmoor & Gower Peninsula', 'region' => 'South West / Wales', 'dfe_priority' => true ],
        'ST' => [ 'name' => 'Mendip Hills, Bristol & Somerset', 'region' => 'South West', 'dfe_priority' => true ],
        'SU' => [ 'name' => 'Wiltshire, Salisbury Plain & New Forest', 'region' => 'South', 'dfe_priority' => true ],
        'SV' => [ 'name' => 'Isles of Scilly', 'region' => 'South West', 'dfe_priority' => false ],
        'SW' => [ 'name' => 'Cornwall (West / Land\'s End)', 'region' => 'South West', 'dfe_priority' => true ],
        'SX' => [ 'name' => 'Dartmoor & Plymouth', 'region' => 'South West', 'dfe_priority' => true ],
        'SY' => [ 'name' => 'Dorset & Jurassic Coast', 'region' => 'South', 'dfe_priority' => true ],
        'SZ' => [ 'name' => 'Isle of Wight & Solent', 'region' => 'South', 'dfe_priority' => true ],
        'TA' => [ 'name' => 'Yorkshire Coast (Scarborough)', 'region' => 'Northern England', 'dfe_priority' => false ],
        'TF' => [ 'name' => 'The Wash & Lincolnshire', 'region' => 'East', 'dfe_priority' => false ],
        'TG' => [ 'name' => 'Norfolk Broads & Coast', 'region' => 'East', 'dfe_priority' => false ],
        'TL' => [ 'name' => 'Cambridge & Bedfordshire', 'region' => 'East', 'dfe_priority' => false ],
        'TM' => [ 'name' => 'Suffolk & Ipswich', 'region' => 'East', 'dfe_priority' => false ],
        'TQ' => [ 'name' => 'London, Surrey Hills & South Downs', 'region' => 'South East', 'dfe_priority' => true ],
        'TR' => [ 'name' => 'Kent & Dover', 'region' => 'South East', 'dfe_priority' => false ],
        'TV' => [ 'name' => 'Beachy Head / Eastbourne', 'region' => 'South East', 'dfe_priority' => false ],
    ];

    private string $storageDir;
    private Terrain_Tile_Compiler $compiler;

    public function __construct( ?string $customStorageDir = null, ?Terrain_Tile_Compiler $compiler = null ) {
        if ( null !== $customStorageDir ) {
            $this->storageDir = rtrim( $customStorageDir, '/' );
        } elseif ( defined( 'DOFE_DEM_DATA_DIR' ) ) {
            $this->storageDir = rtrim( constant( 'DOFE_DEM_DATA_DIR' ), '/' );
        } elseif ( defined( 'WP_CONTENT_DIR' ) ) {
            $this->storageDir = rtrim( constant( 'WP_CONTENT_DIR' ), '/' ) . '/dofe-dem-data';
        } else {
            // Sibling fallback or local dev fallback
            $wpEnvPath = dirname( __DIR__, 4 ) . '/wordpress-env/wordpress/wp-content/dofe-dem-data';
            $this->storageDir = is_dir( dirname( $wpEnvPath ) ) ? $wpEnvPath : ( dirname( __DIR__, 3 ) . '/dem-data' );
        }

        $this->compiler = $compiler ?? new Terrain_Tile_Compiler();
    }

    public function getStorageDir(): string {
        return $this->storageDir;
    }

    /**
     * Ensures the DEM storage directory exists with proper security files.
     */
    public function ensureDirectory(): bool {
        if ( ! is_dir( $this->storageDir ) ) {
            if ( ! mkdir( $this->storageDir, 0755, true ) && ! is_dir( $this->storageDir ) ) {
                return false;
            }
        }

        // Add protective index.php
        $indexFile = $this->storageDir . '/index.php';
        if ( ! file_exists( $indexFile ) ) {
            file_put_contents( $indexFile, "<?php // Silence is golden.\n" );
        }

        // Add protective .htaccess
        $htaccessFile = $this->storageDir . '/.htaccess';
        if ( ! file_exists( $htaccessFile ) ) {
            file_put_contents( $htaccessFile, "Deny from all\n" );
        }

        return true;
    }

    /**
     * Lists all 55 UK squares with their installation, size, validity, and benchmark status.
     *
     * @return array<string, array{
     *     square: string,
     *     name: string,
     *     region: string,
     *     dfe_priority: bool,
     *     installed: bool,
     *     file_path: string,
     *     file_size: int,
     *     is_valid_size: bool,
     *     modified_at: ?string,
     *     benchmark: ?array{passed: bool, message: string}
     * }>
     */
    public function listTiles(): array {
        $this->ensureDirectory();
        $result = [];

        foreach ( self::UK_GRID_SQUARES as $square => $info ) {
            $filePath  = $this->storageDir . '/' . $square . '.bin';
            $installed = file_exists( $filePath );

            $fileSize    = $installed ? ( filesize( $filePath ) ?: 0 ) : 0;
            $isValidSize = $installed && ( Terrain_Tile_Compiler::EXPECTED_FILE_SIZE === $fileSize );
            $modifiedAt  = $installed ? date( 'Y-m-d H:i:s', filemtime( $filePath ) ?: time() ) : null;

            $benchmark = null;
            if ( $installed && $isValidSize ) {
                $bmResult = $this->compiler->verifyBenchmark( $filePath, $square );
                if ( null !== $bmResult ) {
                    $benchmark = [
                        'passed'  => $bmResult['passed'],
                        'message' => $bmResult['message'],
                    ];
                }
            }

            $result[ $square ] = [
                'square'        => $square,
                'name'          => $info['name'],
                'region'        => $info['region'],
                'dfe_priority'  => $info['dfe_priority'],
                'installed'     => $installed,
                'file_path'     => $filePath,
                'file_size'     => $fileSize,
                'is_valid_size' => $isValidSize,
                'modified_at'   => $modifiedAt,
                'benchmark'     => $benchmark,
            ];
        }

        return $result;
    }

    /**
     * Returns metadata for a single square tile.
     *
     * @param string $square 2-letter uppercase square.
     * @return array{
     *     square: string,
     *     name: string,
     *     region: string,
     *     dfe_priority: bool,
     *     installed: bool,
     *     file_path: string,
     *     file_size: int,
     *     is_valid_size: bool,
     *     modified_at: ?string,
     *     benchmark: ?array{passed: bool, message: string}
     * }
     */
    public function getTileInfo( string $square ): array {
        $square = strtoupper( trim( $square ) );
        $list   = $this->listTiles();

        if ( ! isset( $list[ $square ] ) ) {
            throw new InvalidArgumentException( "Unknown OS Grid square: {$square}" );
        }

        return $list[ $square ];
    }

    /**
     * Saves an uploaded .bin file or extracts .bin files from an uploaded .zip archive into the DEM directory.
     *
     * @param string $tmpFilePath Path to uploaded temporary file.
     * @param string $originalFilename Original uploaded filename.
     * @param string|null $overrideSquare Optional explicit square override.
     * @return array<int, array{
     *     square: string,
     *     name: string,
     *     region: string,
     *     dfe_priority: bool,
     *     installed: bool,
     *     file_path: string,
     *     file_size: int,
     *     is_valid_size: bool,
     *     modified_at: ?string,
     *     benchmark: ?array{passed: bool, message: string}
     * }>
     */
    public function saveUploadedFile( string $tmpFilePath, string $originalFilename, ?string $overrideSquare = null ): array {
        $this->ensureDirectory();

        if ( ! file_exists( $tmpFilePath ) ) {
            throw new RuntimeException( "Uploaded file not found: {$tmpFilePath}" );
        }

        $lowerExt = strtolower( pathinfo( $originalFilename, PATHINFO_EXTENSION ) );
        $saved    = [];

        if ( 'zip' === $lowerExt ) {
            // Process ZIP bundle of binary tiles
            $zip = new ZipArchive();
            if ( true !== $zip->open( $tmpFilePath ) ) {
                throw new RuntimeException( "Cannot open uploaded zip file: {$originalFilename}" );
            }

            for ( $i = 0; $i < $zip->numFiles; $i++ ) {
                $stat = $zip->statIndex( $i );
                if ( false === $stat ) {
                    continue;
                }

                $filename = basename( $stat['name'] );
                if ( preg_match( '/^([A-Z]{2})\.bin$/i', $filename, $matches ) ) {
                    $sq        = strtoupper( $matches[1] );
                    $targetBin = $this->storageDir . '/' . $sq . '.bin';

                    $fpIn = $zip->getStream( $stat['name'] );
                    if ( ! $fpIn ) {
                        continue;
                    }

                    $fpOut = fopen( $targetBin, 'wb' );
                    if ( ! $fpOut ) {
                        fclose( $fpIn );
                        continue;
                    }

                    stream_copy_to_stream( $fpIn, $fpOut );
                    fclose( $fpIn );
                    fclose( $fpOut );

                    $saved[] = $this->getTileInfo( $sq );
                }
            }

            $zip->close();

            if ( empty( $saved ) ) {
                throw new RuntimeException( "No valid XX.bin binary tiles found inside zip archive '{$originalFilename}'." );
            }

            return $saved;
        }

        // Direct .bin file upload
        $square = null;
        if ( ! empty( $overrideSquare ) ) {
            $square = strtoupper( trim( $overrideSquare ) );
        } elseif ( preg_match( '/^([A-Z]{2})\.bin$/i', $originalFilename, $matches ) ) {
            $square = strtoupper( $matches[1] );
        }

        if ( empty( $square ) || ! isset( self::UK_GRID_SQUARES[ $square ] ) ) {
            throw new InvalidArgumentException( "Cannot determine valid 2-letter UK OS Grid square from filename '{$originalFilename}'." );
        }

        $targetFile = $this->storageDir . '/' . $square . '.bin';
        $tmpTarget  = $targetFile . '.upload.' . bin2hex( random_bytes( 4 ) );

        if ( ! copy( $tmpFilePath, $tmpTarget ) ) {
            throw new RuntimeException( "Failed to write uploaded file to destination directory." );
        }

        $size = filesize( $tmpTarget );
        if ( Terrain_Tile_Compiler::EXPECTED_FILE_SIZE !== $size ) {
            unlink( $tmpTarget );
            throw new RuntimeException(
                "Invalid binary DEM file size for {$square}.bin: expected " .
                Terrain_Tile_Compiler::EXPECTED_FILE_SIZE . " bytes (8MB), got {$size} bytes."
            );
        }

        if ( ! rename( $tmpTarget, $targetFile ) ) {
            unlink( $tmpTarget );
            throw new RuntimeException( "Failed to finalize destination file: {$targetFile}" );
        }

        return [ $this->getTileInfo( $square ) ];
    }

    /**
     * Deletes an installed tile from disk.
     *
     * @param string $square 2-letter uppercase square.
     * @return bool True if deleted, false if file did not exist.
     */
    public function deleteTile( string $square ): bool {
        $square   = strtoupper( trim( $square ) );
        $filePath = $this->storageDir . '/' . $square . '.bin';

        if ( file_exists( $filePath ) ) {
            return unlink( $filePath );
        }

        return false;
    }
}
