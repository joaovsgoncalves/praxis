import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Palette } from "lucide-react";
import { toast } from "sonner";
import { praxisApi } from "@/api/praxisClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import SourceChip from "@/components/finance/SourceChip";
import { accountBrand, brandOptionsFor, brandSurfaceStyle } from "@/lib/financeBrand";
import { CARD_SITUATION_LABELS, formatDay } from "@/lib/finance";
import {
  STACK_CARD_WIDTH,
  STACK_MAX_STEP,
  STACK_MAX_VISIBLE,
  stackStep,
  stackStepIndex,
  stackVisibleCount,
  stackWindow,
} from "@/lib/walletStack";
import { cn } from "@/lib/utils";

// Fatia do cartão de trás: padding esquerdo (16) + respiro antes do cartão da frente (8)
const PEEK_TEXT_INSET = 24;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Troca de cor/final com atualização otimista no overview (o cartão muda na hora). */
function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => praxisApi.finance.accounts.update(id, data),
    onMutate: async ({ id, data }) => {
      const key = ["finance", "overview"];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) =>
        old
          ? { ...old, accounts: (old.accounts || []).map((a) => (a.id === id ? { ...a, ...data } : a)) }
          : old,
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      queryClient.setQueryData(["finance", "overview"], context?.previous);
      toast.error(err?.message || "Não deu para salvar o cartão");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
  });
}

function BrandPicker({ card, onUpdate, busy }) {
  const account = card.account;
  const options = brandOptionsFor(account);
  const current = account?.brand_color || null;
  const effective = accountBrand(account).id;
  const [last4, setLast4] = useState(account?.card_last4 || "");

  useEffect(() => {
    setLast4(account?.card_last4 || "");
  }, [account?.card_last4]);

  function saveLast4() {
    const clean = last4.replace(/\D/g, "");
    if (clean === (account?.card_last4 || "")) return;
    if (clean && clean.length !== 4) {
      toast.error("O final do cartão tem 4 dígitos");
      return;
    }
    onUpdate({ card_last4: clean || null });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pointer-events-auto relative z-10 -mr-2 -mt-2 flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-out hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current active:scale-[0.96]"
          aria-label={`Cor e final do cartão ${card.name}`}
        >
          <Palette className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-4 rounded-xl p-4">
        <div className="space-y-2.5">
          <p className="text-sm font-medium">Cor do cartão</p>
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Cores">
            {options.map((option) => {
              const selected = effective === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onUpdate({ brand_color: option.id })}
                  aria-pressed={selected}
                  aria-label={option.label}
                  title={option.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.14)]",
                      option.neutral && "shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.6)]",
                      selected && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                    )}
                    style={brandSurfaceStyle(option)}
                  >
                    {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          {current ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onUpdate({ brand_color: null })}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Voltar para a cor do banco
            </button>
          ) : null}
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Final do cartão</span>
          <Input
            inputMode="numeric"
            maxLength={4}
            placeholder="4 dígitos"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onBlur={saveLast4}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveLast4();
            }}
            className="h-10 font-mono tabular-nums tracking-[0.2em]"
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}

const CARD_SITUATION_SPOKEN = {
  paid: "Fatura paga",
  min_paid_rolled: "Mínimo pago, o resto rolou para o próximo mês",
  min_open: "Mínimo em aberto",
};

// Selo sólido com texto escuro: lê AA em qualquer cor de cartão. Rolar é decisão, então neutro; só o mínimo em aberto alerta.
const SEAL_CLASS = {
  paid: "bg-emerald-100 text-emerald-900",
  min_paid_rolled: "bg-amber-50 text-stone-800",
  min_open: "bg-amber-300 text-amber-950",
};

function SituationSeal({ situation }) {
  if (!situation || !CARD_SITUATION_LABELS[situation]) return null;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none",
        SEAL_CLASS[situation],
      )}
    >
      {CARD_SITUATION_LABELS[situation]}
    </span>
  );
}

function BankCard({ card, money, active, onSelect, onUpdate, busy, className, peekWidth }) {
  const { brand } = card;
  const muted = { color: brand.muted };
  // Atrás na pilha só a fatia aparece: o nome trunca dentro dela (reticências visíveis).
  const nameStyle = peekWidth ? { maxWidth: Math.max(0, peekWidth - PEEK_TEXT_INSET) } : undefined;
  const billLine = card.bill ? `Fatura ${money(card.bill.total)} · pago ${money(card.bill.paid ?? 0)}` : null;
  const limitLine = card.limitAvailable != null ? `Limite livre ${money(card.limitAvailable)}` : null;
  const situation = card.situation || (card.bill?.paidOff ? "paid" : null);
  const spoken = [
    `${card.name}, ${card.typeLabel}. ${card.amountLabel} ${money(card.amount)}`,
    billLine,
    limitLine,
    card.dueLabel,
    situation ? CARD_SITUATION_SPOKEN[situation] : null,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <div
      data-active={active ? "true" : "false"}
      className={cn(
        "praxis-bank-card relative flex h-[184px] w-72 select-none flex-col justify-between overflow-hidden rounded-[20px] p-4",
        brand.neutral && "praxis-bank-card-neutral",
        className,
      )}
      style={brandSurfaceStyle(brand)}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={spoken}
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current"
      />
      <div className="pointer-events-none relative flex items-start justify-between gap-2">
        <div className="min-w-0" style={nameStyle}>
          {card.bankLabel ? (
            <p className="truncate text-[11px] font-medium leading-tight" style={muted}>
              {card.bankLabel}
            </p>
          ) : null}
          <p className="truncate text-[15px] font-semibold leading-tight tracking-[-0.01em]">{card.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[11px] font-medium" style={muted}>
            {card.typeLabel}
          </span>
          {active && onUpdate && card.accountId ? <BrandPicker card={card} onUpdate={onUpdate} busy={busy} /> : null}
        </div>
      </div>
      <div className="pointer-events-none relative">
        <div className="flex min-h-[18px] items-center gap-1.5">
          <p className="text-[11px] font-medium" style={muted}>
            {card.amountLabel}
          </p>
          <SituationSeal situation={situation} />
        </div>
        <p className="truncate font-display text-[1.65rem] font-semibold leading-tight tracking-[-0.02em] tabular-nums">
          {money(card.amount)}
        </p>
        {billLine || limitLine ? (
          <div className="mt-0.5 space-y-px text-[11px] font-medium leading-tight tabular-nums" style={muted}>
            {billLine ? <p className="truncate">{billLine}</p> : null}
            {limitLine ? <p className="truncate">{limitLine}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="pointer-events-none relative flex min-h-4 items-center justify-between gap-2 text-xs">
        {card.last4 ? (
          <span className="font-mono tabular-nums tracking-[0.14em]" style={muted}>
            <span className="sr-only">Final </span>
            <span aria-hidden>•••• </span>
            {card.last4}
          </span>
        ) : (
          <span />
        )}
        {card.dueLabel ? <span className="font-medium tabular-nums">{card.dueLabel}</span> : null}
      </div>
    </div>
  );
}

/**
 * Desktop: até 4 cartões em leque — o ativo na frente (direita) e os próximos atrás,
 * cada fatia com ≥ 56px. Os demais ficam a um "›" de distância.
 */
function CardStack({ cards, activeIndex, onSelect, renderCard, className }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = stackVisibleCount(width, cards.length);
  const step = stackStep(width, count);
  const visible = stackWindow(cards.length, activeIndex, count);

  return (
    <div
      ref={ref}
      className={cn("relative h-[196px] w-full", className)}
      style={{ maxWidth: STACK_CARD_WIDTH + STACK_MAX_STEP * (STACK_MAX_VISIBLE - 1) }}
    >
      {visible.map((cardIndex, slot) => {
        const card = cards[cardIndex];
        const isActive = cardIndex === activeIndex;
        return (
          <div
            key={card.key}
            className="praxis-bank-slot absolute left-0 top-2"
            style={{ transform: `translate3d(${slot * step}px, 0, 0)`, zIndex: slot + 1 }}
          >
            {renderCard(card, {
              active: isActive,
              peekWidth: isActive ? undefined : step,
              onSelect: () => onSelect(card.key),
            })}
          </div>
        );
      })}
    </div>
  );
}

function StackNav({ total, activeIndex, onStep, className }) {
  const buttonClass =
    "flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-transform duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";
  return (
    <div className={cn("items-center gap-0.5", className)}>
      <button type="button" className={buttonClass} onClick={() => onStep(-1)} aria-label="Cartão anterior">
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-[3.25rem] text-center font-mono text-xs tabular-nums text-muted-foreground">
        <span className="sr-only">Cartão </span>
        {activeIndex + 1}/{total}
      </span>
      <button type="button" className={buttonClass} onClick={() => onStep(1)} aria-label="Próximo cartão">
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Celular: carrossel com snap; o cartão mais centralizado vira o ativo. */
function CardCarousel({ cards, activeKey, onSelect, renderCard, className }) {
  const scroller = useRef(null);
  const frame = useRef(0);

  const handleScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = scroller.current;
      if (!el) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = null;
      let bestDist = Infinity;
      for (const child of el.children) {
        const dist = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = child.dataset.key;
        }
      }
      if (best && best !== activeKey) onSelect(best);
    });
  }, [activeKey, onSelect]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div
      ref={scroller}
      onScroll={handleScroll}
      className={cn("praxis-scroll-x flex snap-x snap-mandatory gap-3 px-1 pb-2 pt-1 scroll-px-1", className)}
      aria-label="Cartões"
    >
      {cards.map((card) => (
        <div key={card.key} data-key={card.key} className="w-[min(84%,20rem)] shrink-0 snap-center">
          {renderCard(card, {
            active: card.key === activeKey,
            className: "w-full",
            onSelect: (event) => {
              onSelect(card.key);
              event?.currentTarget?.closest("[data-key]")?.scrollIntoView({
                behavior: prefersReducedMotion() ? "auto" : "smooth",
                inline: "center",
                block: "nearest",
              });
            },
          })}
        </div>
      ))}
    </div>
  );
}

export default function WalletCards({ cards, money }) {
  const [activeKey, setActiveKey] = useState(cards[0]?.key);
  const updateAccount = useUpdateAccount();
  const foundIndex = cards.findIndex((c) => c.key === activeKey);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;
  const active = cards[activeIndex];

  const select = useCallback((key) => setActiveKey(key), []);

  if (!active) return null;

  const stepActive = (delta) => setActiveKey(cards[stackStepIndex(cards.length, activeIndex, delta)].key);

  const renderCard = (card, { active: isActive, onSelect, className, peekWidth }) => (
    <BankCard
      card={card}
      money={money}
      active={isActive}
      onSelect={onSelect}
      className={className}
      peekWidth={peekWidth}
      busy={updateAccount.isPending}
      onUpdate={(data) => updateAccount.mutate({ id: card.accountId, data })}
    />
  );

  return (
    <div className="min-w-0 space-y-2">
      <CardStack
        className="hidden sm:block"
        cards={cards}
        activeIndex={activeIndex}
        onSelect={select}
        renderCard={renderCard}
      />
      <CardCarousel
        className="sm:hidden"
        cards={cards}
        activeKey={active.key}
        onSelect={select}
        renderCard={renderCard}
      />
      <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground" aria-live="polite">
        <span className="font-medium text-foreground">{active.name}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {active.asOf ? `${active.asOfLabel} ${formatDay(active.asOf)}` : "Sem data do último saldo"}
        </span>
        <SourceChip source={active.source} />
        {cards.length > 1 ? (
          <span className="ml-auto tabular-nums sm:hidden" aria-hidden>
            {activeIndex + 1}/{cards.length}
          </span>
        ) : null}
        {cards.length > STACK_MAX_VISIBLE ? (
          <StackNav
            className="ml-auto hidden sm:flex"
            total={cards.length}
            activeIndex={activeIndex}
            onStep={stepActive}
          />
        ) : null}
      </div>
    </div>
  );
}
