import type {
  ImportFile,
  ImportPreview,
  ImportQuestion,
  ImportSection,
  ImportValidation,
} from "@/backend";
import { QuestionTab } from "@/backend";
import { DemoSettingsNote } from "@/components/DemoBanner";
import { AdminSection, FormField } from "@/components/admin/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { canAdmin, useAccessState } from "@/hooks/useAccess";
import { useDemo } from "@/hooks/useDemo";
import { useI18n } from "@/hooks/useI18n";
import {
  useClearOpeningQuestions,
  useImportOpeningQuestions,
  useOpeningQuestionEmailSettings,
  useOpeningQuestionFinishBy,
  useOpeningQuestions,
  useSetOpeningQuestionFinishBy,
  useUpdateOpeningQuestionEmailSettings,
} from "@/hooks/useQueries";
import {
  dateOnlyToInputValue,
  formatDateOnly,
  inputValueToDateOnly,
} from "@/lib/format";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";

/* ---------------------------------------------------------------------------
   Local copy for the Opening Questions admin panel. The shared `oq.admin.*`
   keys in lib/copy.ts cover the headings and actions; these strings cover the
   file-shape guidance and the validation wording the panel adds.
--------------------------------------------------------------------------- */

interface OqAdminCopy {
  fileHint: string;
  fileShape: string;
  reading: string;
  invalidJson: string;
  previewTitle: string;
  previewSections: string;
  previewTotal: string;
  previewKitchen: string;
  previewService: string;
  previewBoth: string;
  previewDan: string;
  importSuccess: string;
  importRefused: string;
  errorSection: string;
  errorNumber: string;
  errorNoNumber: string;
  clearTitle: string;
  clearSuccess: string;
  clearError: string;
  emailHint: string;
  emailError: string;
  emailSaved: string;
  finishByTitle: string;
  finishByHint: string;
  finishByLabel: string;
  finishByCurrent: string;
  finishByNone: string;
  finishBySave: string;
  finishByClear: string;
  finishBySaved: string;
  finishByCleared: string;
  finishByError: string;
}

const OQ_ADMIN_COPY: Record<"en" | "es", OqAdminCopy> = {
  en: {
    fileHint:
      "Accepts a .json file with kind roadie-roster-opening-questions and version 1.",
    fileShape:
      "Each section has a title and numbered questions with category (kitchen, service, shared, dan), question and answer.",
    reading: "Reading file…",
    invalidJson: "That file isn't valid JSON.",
    previewTitle: "Review before importing",
    previewSections: "Sections",
    previewTotal: "Questions",
    previewKitchen: "Kitchen",
    previewService: "Service",
    previewBoth: "Both",
    previewDan: "Dan",
    importSuccess: "Questions imported.",
    importRefused: "Questions already exist. Clear them before importing.",
    errorSection: "Section",
    errorNumber: "Question",
    errorNoNumber: "Whole file",
    clearTitle: "Clear all questions",
    clearSuccess: "All questions cleared.",
    clearError: "We couldn't clear the questions.",
    emailHint:
      "Send a 7 AM summary to the Managing Partner, Kitchen Manager, Service Manager and Admin.",
    emailError: "We couldn't save the daily email setting.",
    emailSaved: "Daily email setting saved.",
    finishByTitle: "Finish-by date",
    finishByHint:
      "Shows a deadline on the Opening Qs page with the days left, or how many days overdue.",
    finishByLabel: "Finish by",
    finishByCurrent: "Currently set to {date}.",
    finishByNone: "No finish-by date is set.",
    finishBySave: "Save date",
    finishByClear: "Clear date",
    finishBySaved: "Finish-by date saved.",
    finishByCleared: "Finish-by date cleared.",
    finishByError: "We couldn't save the finish-by date.",
  },
  es: {
    fileHint:
      "Acepta un archivo .json con kind roadie-roster-opening-questions y versión 1.",
    fileShape:
      "Cada sección tiene un título y preguntas numeradas con categoría (kitchen, service, shared, dan), pregunta y respuesta.",
    reading: "Leyendo archivo…",
    invalidJson: "Ese archivo no es JSON válido.",
    previewTitle: "Revisa antes de importar",
    previewSections: "Secciones",
    previewTotal: "Preguntas",
    previewKitchen: "Cocina",
    previewService: "Servicio",
    previewBoth: "Ambas",
    previewDan: "Dan",
    importSuccess: "Preguntas importadas.",
    importRefused: "Ya existen preguntas. Bórralas antes de importar.",
    errorSection: "Sección",
    errorNumber: "Pregunta",
    errorNoNumber: "Todo el archivo",
    clearTitle: "Borrar todas las preguntas",
    clearSuccess: "Se borraron todas las preguntas.",
    clearError: "No pudimos borrar las preguntas.",
    emailHint:
      "Envía un resumen a las 7 AM al Socio gerente, Gerente de cocina, Gerente de servicio y al Admin.",
    emailError: "No pudimos guardar el ajuste del correo diario.",
    emailSaved: "Ajuste del correo diario guardado.",
    finishByTitle: "Fecha límite",
    finishByHint:
      "Muestra una fecha límite en la página de Preguntas de apertura con los días restantes o los días de retraso.",
    finishByLabel: "Terminar antes del",
    finishByCurrent: "Fecha actual: {date}.",
    finishByNone: "No hay fecha límite establecida.",
    finishBySave: "Guardar fecha",
    finishByClear: "Borrar fecha",
    finishBySaved: "Fecha límite guardada.",
    finishByCleared: "Fecha límite borrada.",
    finishByError: "No pudimos guardar la fecha límite.",
  },
};

/* ---------------------------------------------------------------------------
   JSON parsing for the documented import shape. The backend validates the
   content; this only makes sure the file is structurally an ImportFile so a
   malformed upload never reaches the canister.
--------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseImportFile(value: unknown): ImportFile | null {
  if (!isRecord(value)) return null;
  const version = toBigInt(value.version);
  if (version === null || !Array.isArray(value.sections)) return null;

  const sections: ImportSection[] = [];
  for (const rawSection of value.sections) {
    if (!isRecord(rawSection) || !Array.isArray(rawSection.questions)) {
      return null;
    }
    const questions: ImportQuestion[] = [];
    for (const rawQuestion of rawSection.questions) {
      if (!isRecord(rawQuestion)) return null;
      const number = toBigInt(rawQuestion.number);
      if (number === null) return null;
      questions.push({
        number,
        category: text(rawQuestion.category),
        question: text(rawQuestion.question),
        answer: text(rawQuestion.answer),
      });
    }
    sections.push({ title: text(rawSection.title), questions });
  }

  return {
    kind: text(value.kind),
    version,
    title: text(value.title),
    sections,
  };
}

export function OpeningQuestionsPanel() {
  const { t, locale } = useI18n();
  const copy = OQ_ADMIN_COPY[locale === "es" ? "es" : "en"];
  const access = useAccessState();
  const demo = useDemo();
  const isAdmin = access.kind === "granted" && canAdmin(access.grant.role);

  const questions = useOpeningQuestions(QuestionTab.all, {}, isAdmin);
  const emailSettings = useOpeningQuestionEmailSettings(isAdmin);
  const finishBy = useOpeningQuestionFinishBy(isAdmin);
  const importQuestions = useImportOpeningQuestions();
  const clearQuestions = useClearOpeningQuestions();
  const updateEmail = useUpdateOpeningQuestionEmailSettings();
  const setFinishBy = useSetOpeningQuestionFinishBy();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<ImportFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [clearText, setClearText] = useState("");
  const [cleared, setCleared] = useState(false);
  const [finishByDraft, setFinishByDraft] = useState("");
  const [finishByNotice, setFinishByNotice] = useState<
    "saved" | "cleared" | null
  >(null);

  // While demo mode is on the section is hidden: these controls change real
  // questions, which demo mode must not touch.
  if (demo.enabled) {
    return (
      <AdminSection
        title={t("oq.title")}
        description={t("oq.demo.hidden")}
        ocid="admin.openingQuestions.section"
      >
        <DemoSettingsNote />
      </AdminSection>
    );
  }

  const questionCount = questions.data?.length ?? 0;
  const hasQuestions = questionCount > 0;
  const importUnavailable = hasQuestions || questions.isLoading;

  const resetFile = () => {
    setPendingFile(null);
    setPreview(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setImported(false);
    setImportError(null);
    setFileError(null);
    setPreview(null);
    setPendingFile(null);
    if (!file) return;
    try {
      const parsed = parseImportFile(JSON.parse(await file.text()));
      if (!parsed) {
        setFileError(copy.invalidJson);
        return;
      }
      setPendingFile(parsed);
      importQuestions.mutate(parsed, {
        onSuccess: (result: ImportValidation) => {
          if (result.__kind__ === "ok") {
            setPreview(result.ok);
          } else {
            setPendingFile(null);
            setImportError(formatImportError(result, copy));
          }
        },
        onError: () => {
          setPendingFile(null);
          setImportError(t("oq.admin.importError"));
        },
      });
    } catch {
      setFileError(copy.invalidJson);
    }
  };

  const onConfirmImport = () => {
    if (!pendingFile) return;
    setImportError(null);
    importQuestions.mutate(pendingFile, {
      onSuccess: (result: ImportValidation) => {
        if (result.__kind__ === "ok") {
          setImported(true);
          resetFile();
        } else {
          setImportError(formatImportError(result, copy));
        }
      },
      onError: () => setImportError(t("oq.admin.importError")),
    });
  };

  const onClear = () => {
    setCleared(false);
    clearQuestions.mutate(clearText, {
      onSuccess: () => {
        setCleared(true);
        setClearText("");
      },
    });
  };

  const onToggleEmail = (enabled: boolean) => {
    updateEmail.mutate({ enabled });
  };

  const storedFinishBy = finishBy.data?.finishBy;
  const finishByInputValue =
    finishByDraft !== ""
      ? finishByDraft
      : storedFinishBy !== undefined
        ? dateOnlyToInputValue(storedFinishBy)
        : "";
  const parsedFinishBy = inputValueToDateOnly(finishByInputValue);

  const onSaveFinishBy = () => {
    if (parsedFinishBy === null) return;
    setFinishByNotice(null);
    setFinishBy.mutate(parsedFinishBy, {
      onSuccess: () => {
        setFinishByDraft("");
        setFinishByNotice("saved");
      },
    });
  };

  const onClearFinishBy = () => {
    setFinishByNotice(null);
    setFinishBy.mutate(null, {
      onSuccess: () => {
        setFinishByDraft("");
        setFinishByNotice("cleared");
      },
    });
  };

  const previewRows = preview
    ? [
        { label: copy.previewSections, value: preview.sectionTitles.length },
        { label: copy.previewTotal, value: Number(preview.questionCount) },
        { label: copy.previewKitchen, value: Number(preview.kitchenCount) },
        { label: copy.previewService, value: Number(preview.serviceCount) },
        { label: copy.previewBoth, value: Number(preview.bothCount) },
        { label: copy.previewDan, value: Number(preview.danCount) },
      ]
    : [];

  return (
    <AdminSection
      title={t("oq.title")}
      description={t("oq.admin.importHint")}
      ocid="admin.openingQuestions.section"
    >
      {!isAdmin ? (
        <p className="text-sm text-muted-foreground">
          {t("oq.admin.importHint")}
        </p>
      ) : (
        <div className="space-y-6">
          {/* Import ------------------------------------------------------- */}
          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              {t("oq.admin.import")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy.fileHint}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {copy.fileShape}
            </p>

            {importUnavailable ? (
              <p
                className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                data-ocid="admin.openingQuestions.import_unavailable_state"
              >
                {copy.importRefused}
              </p>
            ) : (
              <div className="mt-3">
                <label
                  htmlFor="oq-import-file"
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-within:ring-2 focus-within:ring-ring"
                  data-ocid="admin.openingQuestions.upload_button"
                >
                  {importQuestions.isPending && !preview ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  )}
                  {importQuestions.isPending && !preview
                    ? copy.reading
                    : t("oq.admin.importButton")}
                  <input
                    ref={fileInputRef}
                    id="oq-import-file"
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    data-ocid="admin.openingQuestions.file_input"
                    onChange={onFileChange}
                  />
                </label>
              </div>
            )}

            {fileError && (
              <p
                className="mt-3 flex items-start gap-2 text-sm font-medium text-destructive"
                data-ocid="admin.openingQuestions.file_error_state"
                role="alert"
              >
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                {fileError}
              </p>
            )}

            {preview && pendingFile && (
              <div
                className="mt-4 rounded-md border border-border bg-muted/40 p-4"
                data-ocid="admin.openingQuestions.preview_panel"
              >
                <p className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {copy.previewTitle}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {preview.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("oq.admin.importPreview", {
                    count: Number(preview.questionCount),
                    sections: preview.sectionTitles.length,
                  })}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {preview.sectionTitles.map((title) => (
                    <li
                      key={title}
                      className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground"
                    >
                      {title}
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  {previewRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-2"
                    >
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="font-mono font-semibold text-foreground">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="min-h-[44px]"
                    data-ocid="admin.openingQuestions.confirm_button"
                    onClick={onConfirmImport}
                    disabled={importQuestions.isPending}
                  >
                    {importQuestions.isPending ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {t("oq.admin.importConfirm")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px]"
                    data-ocid="admin.openingQuestions.cancel_button"
                    onClick={resetFile}
                    disabled={importQuestions.isPending}
                  >
                    {t("oq.admin.importCancel")}
                  </Button>
                </div>
              </div>
            )}

            {importError && (
              <p
                className="mt-3 flex items-start gap-2 text-sm font-medium text-destructive"
                data-ocid="admin.openingQuestions.import_error_state"
                role="alert"
              >
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                {importError}
              </p>
            )}
            {imported && (
              <p
                className="mt-3 flex items-center gap-2 text-sm font-medium text-accent"
                data-ocid="admin.openingQuestions.import_success_state"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {copy.importSuccess}
              </p>
            )}
          </div>

          {/* Clear all ---------------------------------------------------- */}
          <div className="border-t border-border pt-5">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              {copy.clearTitle}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("oq.admin.clearHint")}
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <FormField
                label={t("oq.admin.clearConfirm")}
                htmlFor="oq-clear-confirm"
                className="flex-1"
              >
                <Input
                  id="oq-clear-confirm"
                  data-ocid="admin.openingQuestions.clear_input"
                  className="min-h-[44px]"
                  value={clearText}
                  onChange={(event) => {
                    setCleared(false);
                    setClearText(event.target.value);
                  }}
                  autoComplete="off"
                />
              </FormField>
              <Button
                type="button"
                variant="destructive"
                className="min-h-[44px]"
                data-ocid="admin.openingQuestions.clear_button"
                onClick={onClear}
                disabled={
                  clearQuestions.isPending ||
                  clearText.trim() !== t("oq.admin.clearConfirm")
                }
              >
                {clearQuestions.isPending ? (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {t("oq.admin.clearButton")}
              </Button>
            </div>
            {cleared && (
              <p
                className="mt-3 text-sm font-medium text-accent"
                data-ocid="admin.openingQuestions.clear_success_state"
              >
                {copy.clearSuccess}
              </p>
            )}
            {clearQuestions.isError && (
              <p
                className="mt-3 text-sm font-medium text-destructive"
                data-ocid="admin.openingQuestions.clear_error_state"
                role="alert"
              >
                {copy.clearError}
              </p>
            )}
          </div>

          {/* Daily email -------------------------------------------------- */}
          <div className="border-t border-border pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
                  {t("oq.admin.email")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {copy.emailHint}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {emailSettings.data?.enabled
                    ? t("oq.admin.emailOn")
                    : t("oq.admin.emailOff")}
                </span>
                <Switch
                  id="oq-email-switch"
                  data-ocid="admin.openingQuestions.email_switch"
                  checked={emailSettings.data?.enabled ?? false}
                  disabled={emailSettings.isLoading || updateEmail.isPending}
                  onCheckedChange={onToggleEmail}
                />
              </div>
            </div>
            {updateEmail.isError && (
              <p
                className="mt-3 text-sm font-medium text-destructive"
                data-ocid="admin.openingQuestions.email_error_state"
                role="alert"
              >
                {copy.emailError}
              </p>
            )}
            {updateEmail.isSuccess && (
              <p
                className="mt-3 text-sm font-medium text-accent"
                data-ocid="admin.openingQuestions.email_success_state"
              >
                {copy.emailSaved}
              </p>
            )}
          </div>

          {/* Finish-by date ----------------------------------------------- */}
          <div className="border-t border-border pt-5">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              {copy.finishByTitle}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy.finishByHint}
            </p>
            <p
              className="mt-2 flex items-center gap-2 text-sm text-foreground"
              data-ocid="admin.openingQuestions.finish_by_current_state"
            >
              <CalendarClock
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              {storedFinishBy !== undefined
                ? copy.finishByCurrent.replace(
                    "{date}",
                    formatDateOnly(storedFinishBy),
                  )
                : copy.finishByNone}
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <FormField
                label={copy.finishByLabel}
                htmlFor="oq-finish-by"
                className="flex-1"
              >
                <Input
                  id="oq-finish-by"
                  type="date"
                  data-ocid="admin.openingQuestions.finish_by_input"
                  className="min-h-[44px]"
                  value={finishByInputValue}
                  disabled={finishBy.isLoading || setFinishBy.isPending}
                  onChange={(event) => {
                    setFinishByNotice(null);
                    setFinishByDraft(event.target.value);
                  }}
                />
              </FormField>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-[44px]"
                  data-ocid="admin.openingQuestions.finish_by_save_button"
                  onClick={onSaveFinishBy}
                  disabled={setFinishBy.isPending || parsedFinishBy === null}
                >
                  {setFinishBy.isPending ? (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CalendarClock
                      className="mr-2 h-4 w-4"
                      aria-hidden="true"
                    />
                  )}
                  {copy.finishBySave}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  data-ocid="admin.openingQuestions.finish_by_clear_button"
                  onClick={onClearFinishBy}
                  disabled={
                    setFinishBy.isPending || storedFinishBy === undefined
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {copy.finishByClear}
                </Button>
              </div>
            </div>
            {setFinishBy.isError && (
              <p
                className="mt-3 flex items-start gap-2 text-sm font-medium text-destructive"
                data-ocid="admin.openingQuestions.finish_by_error_state"
                role="alert"
              >
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                {copy.finishByError}
              </p>
            )}
            {finishByNotice && (
              <p
                className="mt-3 flex items-center gap-2 text-sm font-medium text-accent"
                data-ocid="admin.openingQuestions.finish_by_success_state"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {finishByNotice === "saved"
                  ? copy.finishBySaved
                  : copy.finishByCleared}
              </p>
            )}
          </div>
        </div>
      )}
    </AdminSection>
  );
}

/** Turn a backend validation error into a message naming the section and number. */
function formatImportError(
  result: ImportValidation,
  copy: OqAdminCopy,
): string {
  if (result.__kind__ !== "err") return "";
  const { sectionTitle, number, message } = result.err;
  const where =
    number !== undefined
      ? `${copy.errorSection} ${sectionTitle || "—"} · ${copy.errorNumber} ${number.toString()}`
      : copy.errorNoNumber;
  return `${where}: ${message}`;
}
