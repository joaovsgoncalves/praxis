import { Router } from 'express';
import { buildRuleBasedPraxiaMirror } from '../lib/avoidanceInsights.js';
import { mondayOf } from '../lib/week.js';
import { asyncRoute } from '../lib/asyncRoute.js';

/**
 * Insights router — mounted at /api/insights
 * Leituras pelo serviço (`services/personal/insights.js`) sobre a camada assíncrona; envelope igual ao da
 * rota antiga, congelada em `test-support/oracles/insightsRoute.bcbadad.js`.
 * Also exports registerPraxiaRoutes for POST /api/praxia/confront
 */
export function createInsightsRouter({ insights, getLocalDateString }) {
  if (!insights) throw new TypeError('createInsightsRouter: informe o serviço insights');
  const router = Router();

  router.get('/best-hours', asyncRoute(async (req, res) => {
    try {
      res.json(await insights.bestHours());
    } catch (error) {
      console.error('Best hours insights error:', error);
      res.status(500).json({ error: error.message });
    }
  }));

  router.get('/correlation', asyncRoute(async (req, res) => {
    try {
      res.json(await insights.correlation(req.query.days));
    } catch (error) {
      console.error('Correlation insights error:', error);
      res.status(500).json({ error: error.message });
    }
  }));

  router.get('/weekly', asyncRoute(async (req, res) => {
    try {
      const weekStart = mondayOf(req.query.week_start || req.query.date);
      const payload = await insights.weekly(weekStart, getLocalDateString());
      res.json(payload);
    } catch (error) {
      console.error('Weekly insights error:', error);
      res.status(500).json({ error: error.message });
    }
  }));

  router.get('/avoidance', asyncRoute(async (req, res) => {
    try {
      const today = req.query.date || getLocalDateString();
      const payload = await insights.avoidance(today);
      res.json(payload);
    } catch (error) {
      console.error('Avoidance insights error:', error);
      res.status(500).json({ error: error.message });
    }
  }));

  return router;
}

export function registerPraxiaRoutes(app, { insights, getLocalDateString, openaiApiKey }) {
  app.post('/api/praxia/confront', asyncRoute(async (req, res) => {
    try {
      const today = req.body?.date || getLocalDateString();
      const note = String(req.body?.note || '').trim().slice(0, 500);
      // A leitura termina (transação fechada) antes de qualquer chamada externa.
      const avoidance = await insights.avoidance(today);
      const rulesMirror = buildRuleBasedPraxiaMirror(avoidance);

      if (!openaiApiKey) {
        return res.json({ ...rulesMirror, avoidance_headline: avoidance.headline });
      }

      try {
        const context = [
          `Data: ${today}`,
          avoidance.headline,
          ...avoidance.bullets.slice(0, 6),
          note ? `Nota do usuário: ${note}` : '',
        ].filter(Boolean).join('\n');

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: process.env.FORJA_PRAXIA_MODEL || process.env.FORJA_PARSE_MODEL || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `Você é a PraxIA, copiloto da Praxis. Tom: direto, parceiro, português BR, sem firula.
Não decide pelo usuário. Espelha padrões de evitação com gentileza e confronto honesto.
Responda APENAS JSON: {"lines": ["...", "..."]} com 3 a 5 frases curtas.
Sem listas numeradas dentro das strings. Sem emoji.`,
              },
              { role: 'user', content: context },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4,
          }),
        });

        if (openaiRes.ok) {
          const data = await openaiRes.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
          const lines = Array.isArray(parsed.lines)
            ? parsed.lines.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
            : [];
          if (lines.length) {
            return res.json({
              source: 'llm',
              lines,
              avoidance_headline: avoidance.headline,
            });
          }
        } else {
          console.error('PraxIA LLM failed:', await openaiRes.text());
        }
      } catch (llmErr) {
        console.error('PraxIA confront error:', llmErr.message);
      }

      res.json({ ...rulesMirror, avoidance_headline: avoidance.headline });
    } catch (error) {
      console.error('PraxIA confront error:', error);
      res.status(500).json({ error: error.message });
    }
  }));
}
