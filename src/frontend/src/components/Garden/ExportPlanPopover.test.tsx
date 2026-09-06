import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { ExportPlanPopover } from './ExportPlanPopover';

// SMA-18 lot 3 — « Exporter le plan » panel (États mockup "Popover export").

// The PDF hint is asserted by its visible text (SMA-175: no data-testid where
// the established selector already works — CodeRabbit #266 round 2).
const PDF_HINT_EN = 'In the print dialog, choose “Save as PDF”.';
const PDF_HINT_FR =
  "Dans la boîte d'impression, choisissez « Enregistrer au format PDF ».";

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderPopover(
  overrides: Partial<{
    open: boolean;
    exporting: boolean;
    onExport: (request: {
      format: 'pdf' | 'png';
      includeLayer: boolean;
    }) => void;
    onClose: () => void;
  }> = {}
) {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const onExport = overrides.onExport ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const utils = render(
    <ThemeProvider theme={createTheme({ palette: { mode: 'light' } })}>
      <ExportPlanPopover
        open={overrides.open ?? true}
        anchorEl={anchor}
        exporting={overrides.exporting ?? false}
        onExport={onExport}
        onClose={onClose}
      />
    </ThemeProvider>
  );
  return { ...utils, anchor, onExport, onClose };
}

describe('ExportPlanPopover (SMA-18 lot 3)', () => {
  it('opens as a labelled dialog with the mockup defaults: PDF selected, layer included', () => {
    renderPopover();
    const dialog = screen.getByRole('dialog', { name: 'Export the plan' });
    const pdf = within(dialog).getByRole('radio', {
      name: /PDF \(A4 landscape\)/,
    });
    const png = within(dialog).getByRole('radio', {
      name: /Image \(PNG, 2×\)/,
    });
    expect(pdf).toBeChecked();
    expect(png).not.toBeChecked();
    // Both subtitles are part of the option labels.
    expect(dialog).toHaveTextContent('Plan + legend + plant list');
    expect(dialog).toHaveTextContent('Grid only, transparent background');
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'Include the Exposure layer and legend',
      })
    ).toBeChecked();
    // Round 1 (orchestrator): the print-dialog reminder under the PDF option.
    expect(within(dialog).getByText(PDF_HINT_EN)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Export' })
    ).toBeEnabled();
  });

  it('exports what was chosen: PNG without the layer', () => {
    const { onExport } = renderPopover();
    const dialog = screen.getByRole('dialog', { name: 'Export the plan' });
    fireEvent.click(
      within(dialog).getByRole('radio', { name: /Image \(PNG, 2×\)/ })
    );
    expect(
      within(dialog).getByRole('radio', { name: /Image \(PNG, 2×\)/ })
    ).toBeChecked();
    expect(
      within(dialog).getByRole('radio', { name: /PDF \(A4 landscape\)/ })
    ).not.toBeChecked();
    // PNG selected: the box no longer promises a legend (round 1, F3) and
    // the PDF hint is gone.
    expect(within(dialog).queryByText(PDF_HINT_EN)).toBeNull();
    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: 'Include the Exposure layer',
      })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith({
      format: 'png',
      includeLayer: false,
    });
  });

  it('exports the defaults untouched: PDF with the layer', () => {
    const { onExport } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledWith({
      format: 'pdf',
      includeLayer: true,
    });
  });

  it('closes on Escape', () => {
    const { onClose } = renderPopover();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks the form and shows progress while a job runs', () => {
    const { onExport } = renderPopover({ exporting: true });
    const dialog = screen.getByRole('dialog', { name: 'Export the plan' });
    const action = within(dialog).getByRole('button', { name: 'Exporting…' });
    expect(action).toBeDisabled();
    expect(
      within(dialog).getByRole('radio', { name: /PDF \(A4 landscape\)/ })
    ).toBeDisabled();
    expect(within(dialog).getByRole('checkbox')).toBeDisabled();
    fireEvent.click(action);
    expect(onExport).not.toHaveBeenCalled();
  });

  it('comes back to the defaults on every opening (the form remounts)', () => {
    const { rerender, anchor } = renderPopover();
    fireEvent.click(screen.getByRole('radio', { name: /Image \(PNG, 2×\)/ }));
    expect(
      screen.getByRole('radio', { name: /Image \(PNG, 2×\)/ })
    ).toBeChecked();
    const closed = (open: boolean) => (
      <ThemeProvider theme={createTheme({ palette: { mode: 'light' } })}>
        <ExportPlanPopover
          open={open}
          anchorEl={anchor}
          exporting={false}
          onExport={vi.fn()}
          onClose={vi.fn()}
        />
      </ThemeProvider>
    );
    rerender(closed(false));
    rerender(closed(true));
    expect(
      screen.getByRole('radio', { name: /PDF \(A4 landscape\)/ })
    ).toBeChecked();
  });

  // CodeRabbit #266 round 1 (F3): the PNG stage renders the grid alone, so
  // the box's label follows the selected format — the legend is promised for
  // PDF only. The print-dialog hint (V2) travels with the PDF option.
  it('the layer box follows the format: legend promised for PDF only, print-dialog hint under PDF', () => {
    renderPopover();
    const dialog = screen.getByRole('dialog', { name: 'Export the plan' });
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'Include the Exposure layer and legend',
      })
    ).toBeChecked();
    expect(within(dialog).getByText(PDF_HINT_EN)).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('radio', { name: /Image \(PNG, 2×\)/ })
    );
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'Include the Exposure layer',
      })
    ).toBeChecked();
    expect(
      within(dialog).queryByRole('checkbox', {
        name: 'Include the Exposure layer and legend',
      })
    ).toBeNull();
    expect(within(dialog).queryByText(PDF_HINT_EN)).toBeNull();

    fireEvent.click(
      within(dialog).getByRole('radio', { name: /PDF \(A4 landscape\)/ })
    );
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'Include the Exposure layer and legend',
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText(PDF_HINT_EN)).toBeInTheDocument();
  });

  it('renders the French copy of the mockup', async () => {
    await i18n.changeLanguage('fr');
    renderPopover();
    const dialog = screen.getByRole('dialog', { name: 'Exporter le plan' });
    expect(
      within(dialog).getByRole('radio', { name: /PDF \(A4 paysage\)/ })
    ).toBeChecked();
    expect(dialog).toHaveTextContent('Plan + légende + liste des plantes');
    expect(dialog).toHaveTextContent('Grille seule, fond transparent');
    expect(
      within(dialog).getByRole('checkbox', {
        name: "Inclure le calque d'exposition et la légende",
      })
    ).toBeChecked();
    expect(within(dialog).getByText(PDF_HINT_FR)).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('radio', { name: /Image \(PNG, 2×\)/ })
    );
    expect(
      within(dialog).getByRole('checkbox', {
        name: "Inclure le calque d'exposition",
      })
    ).toBeChecked();
    expect(
      within(dialog).getByRole('button', { name: 'Exporter' })
    ).toBeInTheDocument();
  });
});
