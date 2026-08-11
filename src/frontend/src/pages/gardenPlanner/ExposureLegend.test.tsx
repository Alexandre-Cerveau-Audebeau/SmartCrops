import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import { ExposureLegend } from './ExposureLegend';

// SMA-15 (5.4): the legend's 5th "Ombre portée" swatch is DYNAMIC — it only
// appears when a blocking infrastructure exists (nothing casts otherwise).

// SMA-393: the no-stored-choice default is now French — pin English like a returning EN visitor.
beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderLegend(hasCastShadow: boolean) {
  return render(
    <ThemeProvider theme={createTheme({ palette: { mode: 'light' } })}>
      <ExposureLegend
        season="summer"
        moment="noon"
        hasCastShadow={hasCastShadow}
      />
    </ThemeProvider>
  );
}

describe('ExposureLegend cast-shadow swatch (SMA-15 5.4)', () => {
  it('shows only the 4 category swatches without a blocking structure', () => {
    renderLegend(false);
    expect(screen.getByText('Full sun')).toBeInTheDocument();
    expect(screen.getByText('Shade')).toBeInTheDocument();
    expect(screen.queryByTestId('legend-cast-shadow')).not.toBeInTheDocument();
  });

  it('adds the "Cast shadow (wall, fence, trellis)" swatch when one exists (R5: every blocking type listed)', () => {
    renderLegend(true);
    const swatch = screen.getByTestId('legend-cast-shadow');
    expect(swatch).toHaveTextContent('Cast shadow (wall, fence, trellis)');
  });
});
