import React from "react";
import { Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PraxisEmptyState, SectionHeading } from "@/components/layout/PraxisPage";
import SourceChip from "@/components/finance/SourceChip";
import { formatDay } from "@/lib/finance";

const KIND = {
  available: { badge: "livre", text: "Saldo em conta" },
  invested: { badge: "auto-invest", text: "Investimento / auto-invest" },
};

function ageText(entry) {
  if (entry.age_days == null) return "data da leitura desconhecida";
  if (entry.age_days === 0) return "lido hoje";
  if (entry.age_days === 1) return "lido ontem";
  return `lido há ${entry.age_days} dias`;
}

/**
 * "O banco mostrou": uma linha por conta e tipo de saldo, com quem mandou e de quando é.
 * A API já escolhe a leitura mais recente entre as origens; aqui nada é somado nem filtrado.
 */
export default function BankShown({ entries, money }) {
  const list = Array.isArray(entries) ? entries : [];
  const stale = list.filter((entry) => entry.stale).length;
  return (
    <section className="space-y-3" aria-label="O banco mostrou" data-testid="bank-shown">
      <SectionHeading
        title="O banco mostrou"
        kicker={
          !list.length
            ? "Saldo que veio direto do banco"
            : stale
              ? `${stale} de ${list.length} com leitura antiga`
              : "Leituras em dia"
        }
      />
      {!list.length ? (
        <PraxisEmptyState
          compact
          icon={Landmark}
          title="Nenhum banco mandou saldo ainda"
          description="Os saldos acima são os que foram informados à mão. Quando o banco responder, a leitura aparece aqui com a data."
        />
      ) : (
        <ul className="space-y-2">
          {list.map((entry) => {
            const kind = KIND[entry.amount_kind] || KIND.available;
            return (
              <li
                key={entry.id}
                data-stale={entry.stale ? "1" : "0"}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{entry.name}</p>
                    <Badge variant="outline" className="border-white/10 text-[10px] uppercase text-muted-foreground">
                      {kind.badge}
                    </Badge>
                    <SourceChip source={entry.source} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {kind.text} · {formatDay(entry.as_of)} ·{" "}
                    <span className={entry.stale ? "font-medium text-amber-200" : undefined}>
                      {ageText(entry)}
                      {entry.stale ? ", pode ter mudado" : ""}
                    </span>
                  </p>
                </div>
                <p className="shrink-0 text-base font-semibold tabular-nums">{money(entry.amount)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
