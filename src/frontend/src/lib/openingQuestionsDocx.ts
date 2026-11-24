import type { QuestionView } from "@/backend";
import { SuggestionState } from "@/backend";
import { formatTimestampMediumDate } from "@/lib/format";
import { AREA_COLORS } from "@/lib/openingQuestions";

/** The localized strings the Word document needs, resolved by the caller. */
export interface DocxCopy {
  cover: string;
  store: string;
  location: string;
  title: string;
  legend: string;
  legendKitchen: string;
  legendService: string;
  legendBoth: string;
  legendDan: string;
  owners: string;
  answer: string;
  finalLine: string;
  approved: string;
  notApproved: string;
  final: string;
  notFinal: string;
  readyForFinal: string;
  awaitingApprovals: string;
  noAnswer: string;
  suggestions: string;
  noSuggestions: string;
  accepted: string;
  open: string;
  declined: string;
  page: string;
  generated: string;
  areaLabel: (area: QuestionView["question"]["area"]) => string;
}

/** The store details printed on the cover. */
export interface DocxStore {
  storeNumber: string;
  location: string;
}

/** Strip the `#` from a hex colour so docx accepts it. */
function hex(color: string): string {
  return color.replace("#", "").toUpperCase();
}

/** The area colours as hex, matching the on-screen pills. */
const AREA_HEX: Record<string, string> = {
  kitchen: "C2571A",
  service: "1E7B8C",
  both: "6B4C9A",
  dan: "14284B",
};

function areaHex(area: QuestionView["question"]["area"]): string {
  return AREA_HEX[area] ?? hex(AREA_COLORS[area]);
}

/** A yyyy-mm-dd stamp for the file name. */
export function docxDateStamp(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Build the Opening Questions Word document in the browser. The `docx` package
 * is imported dynamically so it is only downloaded when the button is pressed.
 * Returns the Blob the caller saves.
 */
export async function buildOpeningQuestionsDocx(
  questions: QuestionView[],
  _store: DocxStore,
  copy: DocxCopy,
): Promise<Blob> {
  const {
    AlignmentType,
    Document,
    Footer,
    HeadingLevel,
    Packer,
    PageNumber,
    Paragraph,
    ShadingType,
    TextRun,
  } = await import("docx");

  const navy = "14284B";
  const red = "B22234";

  const cover = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 200 },
      children: [
        new TextRun({
          text: copy.cover,
          bold: true,
          size: 64,
          color: navy,
          font: "Oswald",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: copy.store,
          bold: true,
          size: 36,
          color: red,
          font: "Oswald",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({ text: copy.location, size: 26, color: "444444" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: copy.title,
          bold: true,
          size: 48,
          color: navy,
          font: "Oswald",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: copy.legend,
          bold: true,
          size: 22,
          color: navy,
          font: "Oswald",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: copy.legendKitchen, bold: true, color: "C2571A" }),
        new TextRun({ text: "   ·   " }),
        new TextRun({ text: copy.legendService, bold: true, color: "1E7B8C" }),
        new TextRun({ text: "   ·   " }),
        new TextRun({ text: copy.legendBoth, bold: true, color: "6B4C9A" }),
        new TextRun({ text: "   ·   " }),
        new TextRun({ text: copy.legendDan, bold: true, color: navy }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [
        new TextRun({
          text: copy.generated.replace("{date}", docxDateStamp()),
          size: 18,
          color: "777777",
        }),
      ],
    }),
    new Paragraph({ pageBreakBefore: true, children: [] }),
  ];

  const body: InstanceType<typeof Paragraph>[] = [];
  let lastSection = "";

  for (const view of questions) {
    const q = view.question;
    if (q.sectionTitle !== lastSection) {
      lastSection = q.sectionTitle;
      body.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 320, after: 120 },
          children: [
            new TextRun({
              text: q.sectionTitle,
              bold: true,
              size: 28,
              color: navy,
              font: "Oswald",
            }),
          ],
        }),
      );
    }

    const areaColor = areaHex(q.area);
    body.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [
          new TextRun({
            text: ` ${copy.areaLabel(q.area)} `,
            bold: true,
            color: "FFFFFF",
            size: 18,
            shading: { type: ShadingType.CLEAR, fill: areaColor },
          }),
          new TextRun({
            text: `   ${q.number}. ${q.question}`,
            bold: true,
            size: 24,
            color: navy,
          }),
        ],
      }),
    );

    body.push(
      new Paragraph({
        spacing: { before: 80, after: 80 },
        shading: { type: ShadingType.CLEAR, fill: "F5F3EE" },
        children: [
          new TextRun({
            text: `${copy.answer}: `,
            bold: true,
            size: 20,
            color: navy,
          }),
          new TextRun({
            text: q.answer.trim() ? q.answer : copy.noAnswer,
            size: 20,
            color: "222222",
          }),
        ],
      }),
    );

    const approvalRuns: InstanceType<typeof TextRun>[] = [
      new TextRun({
        text: `${copy.owners}: `,
        bold: true,
        size: 18,
        color: navy,
      }),
    ];
    if (view.owners.length === 0) {
      approvalRuns.push(new TextRun({ text: "—", size: 18, color: "666666" }));
    }
    view.owners.forEach((owner, index) => {
      const approved = view.ownerApprovals.some(
        (a) => a.principal.toText() === owner.principal.toText(),
      );
      const approval = q.approvals.find(
        (a) => a.principal.toText() === owner.principal.toText(),
      );
      if (index > 0) approvalRuns.push(new TextRun({ text: "    " }));
      approvalRuns.push(
        new TextRun({
          text: approved ? "☑ " : "☐ ",
          size: 20,
          color: approved ? "2B5DA8" : "666666",
        }),
      );
      approvalRuns.push(new TextRun({ text: owner.displayName, size: 18 }));
      if (approved && approval) {
        approvalRuns.push(
          new TextRun({
            text: ` (${formatTimestampMediumDate(approval.at)})`,
            size: 16,
            color: "666666",
          }),
        );
      }
    });
    body.push(
      new Paragraph({ spacing: { after: 40 }, children: approvalRuns }),
    );

    // The final line mirrors the on-screen rules: a finalized question names
    // who signed it off, a question whose owners have all approved reads
    // Ready for final, and anything else is still awaiting approvals.
    const finalText = view.isFinal
      ? view.finalizedByName
        ? `${copy.final} · ${view.finalizedByName}`
        : copy.final
      : view.readyForFinal
        ? copy.readyForFinal
        : copy.awaitingApprovals;
    const finalColor = view.isFinal
      ? "2B5DA8"
      : view.readyForFinal
        ? "B22234"
        : "666666";
    body.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `${copy.finalLine}: `,
            bold: true,
            size: 18,
            color: navy,
          }),
          new TextRun({
            text: finalText,
            bold: view.readyForFinal && !view.isFinal,
            size: 18,
            color: finalColor,
          }),
        ],
      }),
    );

    if (q.suggestions.length > 0) {
      body.push(
        new Paragraph({
          spacing: { before: 60, after: 40 },
          children: [
            new TextRun({
              text: copy.suggestions,
              bold: true,
              size: 18,
              color: navy,
            }),
          ],
        }),
      );
      for (const s of q.suggestions) {
        const stateLabel =
          s.state === SuggestionState.accepted
            ? copy.accepted
            : s.state === SuggestionState.declined
              ? copy.declined
              : copy.open;
        body.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `• ${s.proposedAnswer}`, size: 18 }),
              new TextRun({
                text: `  [${stateLabel}]`,
                bold: true,
                size: 16,
                color: areaColor,
              }),
              ...(s.note
                ? [
                    new TextRun({
                      text: ` — ${s.note}`,
                      size: 16,
                      color: "666666",
                    }),
                  ]
                : []),
            ],
          }),
        );
      }
    } else {
      body.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: copy.noSuggestions,
              size: 16,
              color: "888888",
            }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Inter", size: 20 } },
      },
    },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${copy.page.replace("{page}", "")} `,
                    size: 16,
                    color: "888888",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: "888888",
                  }),
                ],
              }),
            ],
          }),
        },
        children: [...cover, ...body],
      },
    ],
  });

  return Packer.toBlob(doc);
}

/** Trigger a browser download of a Blob under the given file name. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** The Word file name: `<store number> Opening Questions <yyyy-mm-dd>.docx`. */
export function docxFileName(storeNumber: string, date = new Date()): string {
  return `${storeNumber} Opening Questions ${docxDateStamp(date)}.docx`;
}
