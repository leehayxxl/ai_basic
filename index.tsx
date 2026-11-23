import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Box, Camera, Eye, RotateCw, ScanLine, Sparkles, ShieldCheck, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BODY_COLORS, type BodyColorId, type CarZone } from "@/data/parts";
import { catalogQuery } from "@/lib/catalog.functions";
import {
  autoFixToLegal,
  computeEstimate,
  conditionalParts,
  detectViolations,
  selectedParts,
  toggleSelection,
} from "@/lib/tuning";
import { deriveVisual, type CameraView, type ZoneLabels } from "@/components/studio/car-visual";
import { PartsPanel } from "@/components/studio/PartsPanel";
import { ViolationBanner } from "@/components/studio/ViolationBanner";
import { EstimateBar } from "@/components/studio/EstimateBar";
import { EstimateDetailDialog } from "@/components/studio/EstimateDetailDialog";
import { BookingDialog } from "@/components/studio/BookingDialog";
import { AiPreviewPanel } from "@/components/studio/AiPreviewPanel";
import { cn } from "@/lib/utils";

const CarViewer = lazy(() => import("@/components/studio/CarViewer"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "아반떼 N 3D 튜닝 시뮬레이터 · 실시간 견적 & 합법 판별" },
      {
        name: "description",
        content:
          "현대 아반떼 N 실제 튜닝 파츠를 3D로 장착해 보고, 부품가·공임비 실시간 견적과 불법 개조 여부를 즉시 확인하세요.",
      },
      { property: "og:title", content: "아반떼 N 3D 튜닝 시뮬레이터" },
      {
        property: "og:description",
        content: "3D 파츠 장착 · 실시간 예상 견적 · 불법 개조 사전 차단까지 한 화면에서.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: Studio,
});

const VIEW_BUTTONS: { id: CameraView; label: string; Icon: typeof Eye }[] = [
  { id: "front", label: "정면", Icon: Eye },
  { id: "side", label: "측면", Icon: ScanLine },
  { id: "rear", label: "후면", Icon: Camera },
  { id: "free", label: "3D 자유회전", Icon: RotateCw },
];

const ZONE_SHORT: Partial<Record<CarZone, string>> = {
  rearWing: "차폭 초과 윙",
  wheels: "휀더 밖 돌출",
  exhaust: "100dB 초과 배기",
  suspension: "지상고 12cm 미만",
  lights: "불법 등화",
};

function Studio() {
  const { data: catalog } = useSuspenseQuery(catalogQuery);
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<CameraView>("free");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiReference, setAiReference] = useState<string | null>(null);
  const [color, setColor] = useState<BodyColorId>("performance-blue");
  const [detailOpen, setDetailOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const parts = useMemo(() => selectedParts(catalog, selected), [catalog, selected]);
  const estimate = useMemo(() => computeEstimate(catalog, selected), [catalog, selected]);
  const violations = useMemo(() => detectViolations(catalog, selected), [catalog, selected]);
  const conditional = useMemo(() => conditionalParts(catalog, selected), [catalog, selected]);
  const visual = useMemo(() => deriveVisual(parts), [parts]);
  const danger = useMemo(() => new Set(violations.map((v) => v.zone)), [violations]);
  const labels = useMemo(() => {
    const l: ZoneLabels = {};
    for (const v of violations) l[v.zone] = ZONE_SHORT[v.zone] ?? v.ruleCategory;
    return l;
  }, [violations]);
  const colorDef = BODY_COLORS.find((c) => c.id === color) ?? BODY_COLORS[0];
  const blocked = violations.length > 0;

  const toggle = useCallback(
    (id: string) => setSelected((cur) => toggleSelection(catalog, cur, id)),
    [catalog],
  );

  const autoFix = useCallback(() => {
    const { next, changes } = autoFixToLegal(catalog, selected);
    setSelected(next);
    toast.success("합법 파츠로 변경했어요", { description: changes.join(" · ") });
  }, [catalog, selected]);

  const openAi = () => {
    const c = canvasRef.current;
    if (c) {
      const scale = Math.min(1, 1024 / c.width);
      const off = document.createElement("canvas");
      off.width = Math.round(c.width * scale);
      off.height = Math.round(c.height * scale);
      const ctx = off.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#16181c";
        ctx.fillRect(0, 0, off.width, off.height);
        ctx.drawImage(c, 0, 0, off.width, off.height);
        setAiReference(off.toDataURL("image/png"));
      }
    }
    setAiOpen(true);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh lg:overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-surface/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-primary font-display text-lg font-bold text-primary-foreground shadow-glow">
            N
          </div>
          <div>
            <h1 className="font-display text-base font-bold leading-tight sm:text-lg">
              AVANTE N <span className="text-primary">TUNING LAB</span>
            </h1>
            <p className="text-[11px] text-muted-foreground">3D 튜닝 시뮬레이터 · 실시간 견적 · AI 합법 판별</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold sm:flex",
              blocked
                ? "border-destructive/60 bg-danger-surface text-destructive-foreground"
                : conditional.length
                  ? "border-warning/40 bg-warning-surface text-warning"
                  : "border-success/40 bg-success-surface text-success",
            )}
          >
            <ShieldCheck className="size-3.5" />
            {blocked ? `불법 ${violations.length}건` : conditional.length ? `승인 필요 ${conditional.length}건` : "합법 상태"}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={!selected.length}>
            <RefreshCcw /> 초기화
          </Button>
        </div>
      </header>

      <ViolationBanner violations={violations} onAutoFix={autoFix} className="border-b" />

      {/* Main */}
      <main className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[3fr_2fr]">
        {/* 3D viewer */}
        <section className="relative h-[58vh] min-h-[380px] overflow-hidden bg-studio lg:h-auto">
          <div className="studio-grid pointer-events-none absolute inset-0 opacity-40" />
          <ClientOnly fallback={<ViewerFallback />}>
            <Suspense fallback={<ViewerFallback />}>
              <CarViewer
                visual={visual}
                bodyColor={colorDef.hex}
                danger={danger}
                labels={labels}
                view={view}
                onCanvas={(c) => (canvasRef.current = c)}
              />
            </Suspense>
          </ClientOnly>

          {/* Toolbar */}
          <div className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-2 p-3">
            <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface/70 p-1 backdrop-blur">
              {VIEW_BUTTONS.map(({ id, label, Icon }) => (
                <Button
                  key={id}
                  variant="studio"
                  size="sm"
                  data-active={!aiOpen && view === id}
                  onClick={() => {
                    setAiOpen(false);
                    setView(id);
                  }}
                  className="border-transparent bg-transparent"
                >
                  <Icon /> {label}
                </Button>
              ))}
            </div>
            <Button variant="studio" size="sm" data-active={aiOpen} onClick={openAi} className="h-10 rounded-xl px-3">
              <Sparkles className="text-primary-glow" /> AI 이미지 합성 미리보기
            </Button>
          </div>

          {aiOpen && (
            <AiPreviewPanel reference={aiReference} parts={parts} colorLabel={colorDef.label} hasViolation={blocked} />
          )}

          {/* Color + status */}
          {!aiOpen && (
            <div className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-end justify-between gap-3 p-3">
              <div className="rounded-xl border border-border bg-surface/70 p-2 backdrop-blur">
                <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  바디 컬러 · {colorDef.label}
                </p>
                <div className="flex gap-1.5">
                  {BODY_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={c.label}
                      onClick={() => setColor(c.id)}
                      className={cn(
                        "size-7 rounded-full border-2 transition-transform hover:scale-110",
                        color === c.id ? "border-primary-glow scale-110" : "border-border",
                      )}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>
              <p className="hidden items-center gap-1.5 rounded-lg bg-surface/70 px-2.5 py-1.5 text-[11px] text-muted-foreground backdrop-blur sm:flex">
                <Box className="size-3.5" /> 드래그로 회전 · 휠로 확대/축소
              </p>
            </div>
          )}
        </section>

        {/* Parts panel */}
        <aside className="flex min-h-0 flex-col border-l border-border bg-surface/40 p-3 lg:overflow-hidden">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">파츠 선택</h2>
            <span className="text-xs text-muted-foreground">실제 아반떼 N 파츠 · {catalog.length}종</span>
          </div>
          <PartsPanel parts={catalog} selected={selected} onToggle={toggle} />
        </aside>
      </main>

      <div className="sticky bottom-0 z-30">
        <ViolationBanner violations={violations} onAutoFix={autoFix} compact className="border-t" />
        <EstimateBar
          estimate={estimate}
          blocked={blocked}
          onDetail={() => setDetailOpen(true)}
          onBook={() => setBookOpen(true)}
        />
      </div>

      <EstimateDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        parts={parts}
        estimate={estimate}
        violations={violations}
      />
      <BookingDialog open={bookOpen && !blocked} onOpenChange={setBookOpen} parts={parts} estimate={estimate} />
    </div>
  );
}

function ViewerFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
      3D 스튜디오 준비 중…
    </div>
  );
}
