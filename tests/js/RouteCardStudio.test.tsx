import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RouteCardStudio } from '../../resources/js/standalone/index';

describe('RouteCardStudio', () => {
    beforeEach(() => {
        // Clear local storage
        localStorage.clear();

        // Mock global fetch for DEM tiles and Route card endpoints
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
            if (url.includes('/dem/tiles')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        success: true,
                        storage_dir: '/test/wp-content/dofe-dem-data',
                        total_tiles: 55,
                        installed: 2,
                        valid: 2,
                        total_bytes: 16000000,
                        total_size_mb: 15.26,
                        tiles: [
                            {
                                square: 'NT',
                                name: 'Edinburgh & Scottish Borders',
                                region: 'Scotland',
                                dfe_priority: true,
                                installed: true,
                                file_path: '/test/wp-content/dofe-dem-data/NT.bin',
                                file_size: 8000000,
                                is_valid_size: true,
                                modified_at: '2026-10-28 12:00:00',
                                benchmark: { passed: true, message: "Arthur's Seat: 245.1m ✓" },
                            },
                            {
                                square: 'NN',
                                name: 'Fort William & Ben Nevis',
                                region: 'Scotland',
                                dfe_priority: true,
                                installed: true,
                                file_path: '/test/wp-content/dofe-dem-data/NN.bin',
                                file_size: 8000000,
                                is_valid_size: true,
                                modified_at: '2026-10-28 12:00:00',
                                benchmark: { passed: true, message: 'Ben Nevis: 1345.1m ✓' },
                            },
                        ],
                    }),
                });
            }

            // Route card endpoint fallback
            return Promise.resolve({
                ok: false,
                status: 404,
                json: async () => ({ success: false, message: 'Not found' }),
            });
        }));
    });

    it('renders studio heading, Route Card Studio tab, and Day 1 tabs', async () => {
        render(<RouteCardStudio />);

        expect(screen.getByText(/DofE Route Card Studio & Terrain Engine/i)).toBeInTheDocument();
        expect(screen.getByText(/Route Card Studio & Sandbox/i)).toBeInTheDocument();
        expect(screen.getByText(/Local DEM Tile Manager/i)).toBeInTheDocument();

        // Check RouteCardBuilder elements
        expect(screen.getByText(/Day 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Save Draft/i)).toBeInTheDocument();
        expect(screen.getByText(/Export PDF/i)).toBeInTheDocument();
    });

    it('switches to DEM Tile Manager tab when clicked', async () => {
        render(<RouteCardStudio />);

        const demTab = screen.getByText(/Local DEM Tile Manager/i);
        fireEvent.click(demTab);

        expect(screen.getByText(/Upload Compiled Elevation Tiles/i)).toBeInTheDocument();

        // Wait for tiles to load from mock fetch
        await waitFor(() => {
            expect(screen.getByText('Edinburgh & Scottish Borders')).toBeInTheDocument();
            expect(screen.getByText('Fort William & Ben Nevis')).toBeInTheDocument();
        });

        // Switch back to Sandbox
        const sandboxTab = screen.getByText(/Route Card Studio & Sandbox/i);
        fireEvent.click(sandboxTab);

        expect(screen.getByText(/Day 1/i)).toBeInTheDocument();
    });
});
