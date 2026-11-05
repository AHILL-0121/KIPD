'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Printing shows only the sheet, on A4, so the sidebar and the page around it never reach the paper.
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(#a4-print-root) { display: none !important; }
  #a4-print-root > article { width: 100% !important; min-height: 0 !important; padding: 0 !important; }
}
`;

/**
 * The page around an A4 document: a toolbar to go back and print, the sheet on screen, and a second copy of the sheet
 * that is the only thing printed. `fileTitle` becomes the page title, which browsers offer as the PDF file name.
 */
export function A4Frame({ fileTitle, backHref, backLabel, actions, sheet, below }: {
  fileTitle: string;
  backHref: string;
  backLabel: string;
  actions?: ReactNode;
  sheet: ReactNode;
  below?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const before = document.title;
    document.title = fileTitle;
    return () => { document.title = before; };
  }, [fileTitle]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-2 rounded text-sm font-medium text-ink-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="hidden text-sm text-ink-muted lg:block">To save a PDF, choose &ldquo;Save as PDF&rdquo; as the printer.</p>
          {actions}
          <Button onClick={() => window.print()}>
            <Printer className="w-4 h-4" aria-hidden="true" /> Print or save as PDF
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto print:hidden">
        <div className="mx-auto w-fit border border-stone-200 shadow-lg">{sheet}</div>
      </div>
      {below && <div className="print:hidden">{below}</div>}
      {mounted && createPortal(<div id="a4-print-root" className="hidden print:block">{sheet}</div>, document.body)}
    </>
  );
}
