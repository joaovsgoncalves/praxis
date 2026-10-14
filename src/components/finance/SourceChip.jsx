import React from "react";
import { Badge } from "@/components/ui/badge";

const SOURCE_CHIP_LABELS = {
  joao: "joão",
  pierre: "pierre",
  pluggy: "banco",
  oficial: "oficial",
  seed: "seed",
  agent: "agente",
  projecao: "projeção",
  projeção: "projeção",
};

export default function SourceChip({ label, source }) {
  const text = label || SOURCE_CHIP_LABELS[source] || source;
  if (!text) return null;
  return (
    <Badge variant="outline" className="border-white/10 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {text}
    </Badge>
  );
}
