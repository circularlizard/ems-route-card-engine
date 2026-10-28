import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteCardStudio } from '../../resources/js/standalone/index';

describe('RouteCardStudio', () => {
    it('renders studio heading and canvas panel', () => {
        render(<RouteCardStudio />);
        expect(screen.getByText('Standalone DofE Route Card Studio')).toBeInTheDocument();
        expect(screen.getByText(/Studio canvas initialized/i)).toBeInTheDocument();
    });
});
