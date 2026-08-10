import { StrictMode } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MeasurementPageProvider } from '../contexts/MeasurementPageContext';
import { useIsMeasurementPage, useMeasurementPage } from './useMeasurementPage';

// Stands in for a declaring page (PlantDetail / PlantLibrary).
function Declare() {
  useMeasurementPage();
  return null;
}

// Stands in for the chrome (Navbar) reading the declaration.
function Reader() {
  return <div data-testid="flag">{String(useIsMeasurementPage())}</div>;
}

describe('useMeasurementPage (SMA-352)', () => {
  it('throws when used outside a MeasurementPageProvider', () => {
    expect(() => renderHook(() => useIsMeasurementPage())).toThrow(
      /MeasurementPageProvider/
    );
  });

  it('declares while mounted and clears on unmount', () => {
    const { rerender } = render(
      <MeasurementPageProvider>
        <Reader />
        <Declare />
      </MeasurementPageProvider>
    );
    expect(screen.getByTestId('flag')).toHaveTextContent('true');

    rerender(
      <MeasurementPageProvider>
        <Reader />
      </MeasurementPageProvider>
    );
    expect(screen.getByTestId('flag')).toHaveTextContent('false');
  });

  it('keeps the flag while ANY declarer is mounted (counter, not boolean)', () => {
    // Two declarers model a route transition where the next page mounts
    // before the previous one unmounts — a boolean would go dark here.
    const { rerender } = render(
      <MeasurementPageProvider>
        <Reader />
        <Declare />
        <Declare />
      </MeasurementPageProvider>
    );
    expect(screen.getByTestId('flag')).toHaveTextContent('true');

    rerender(
      <MeasurementPageProvider>
        <Reader />
        <Declare />
      </MeasurementPageProvider>
    );
    expect(screen.getByTestId('flag')).toHaveTextContent('true');

    rerender(
      <MeasurementPageProvider>
        <Reader />
      </MeasurementPageProvider>
    );
    expect(screen.getByTestId('flag')).toHaveTextContent('false');
  });

  it('survives StrictMode double-invoked effects', () => {
    render(
      <StrictMode>
        <MeasurementPageProvider>
          <Reader />
          <Declare />
        </MeasurementPageProvider>
      </StrictMode>
    );
    expect(screen.getByTestId('flag')).toHaveTextContent('true');
  });
});
