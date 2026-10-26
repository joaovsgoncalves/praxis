import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { buildFrontsViewModel } from '@/lib/projects';
import FrontRow from './FrontRow';

export default function FrontsList({
  projects = [],
  guidance = null,
  onOpenProject,
}) {
  const { groups } = useMemo(
    () => buildFrontsViewModel(projects, guidance),
    [projects, guidance]
  );
  // Mães abertas ficam só em memória: ao sair da página tudo volta recolhido.
  const [expanded, setExpanded] = useState(() => new Set());
  const reduceMotion = useReducedMotion();

  if (!groups.length) {
    return null;
  }

  const toggle = (project) => {
    const key = project.id || project.slug;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const reveal = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : {
        initial: { opacity: 0, y: -4 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: 'easeOut' } },
        transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
      };

  return (
    <section className="space-y-5">
      <h2 className="px-0.5 text-sm font-semibold text-stone-100">Suas frentes</h2>

      {groups.map((group) => (
        <div key={group.id} className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">
            {group.title}
          </h3>

          <div className="space-y-1.5">
            {group.fronts.map((root) => {
              const key = root.id || root.slug;
              const isOpen = expanded.has(key);
              return (
                <React.Fragment key={key}>
                  <FrontRow
                    project={root}
                    onOpen={onOpenProject}
                    expanded={isOpen}
                    onToggle={toggle}
                  />
                  <AnimatePresence initial={false}>
                    {isOpen && root.subfronts.length > 0 ? (
                      <motion.div
                        key="children"
                        initial={reveal.initial}
                        animate={reveal.animate}
                        exit={reveal.exit}
                        transition={reveal.transition}
                        className="space-y-1.5"
                      >
                        {root.subfronts.map((sub) => (
                          <FrontRow
                            key={sub.id || sub.slug}
                            project={sub}
                            onOpen={onOpenProject}
                            isSubfront
                          />
                        ))}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
