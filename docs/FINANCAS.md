# Finanças na Praxis — Guia do João

A aba **/financas** é onde você vê o mês inteiro em 10 segundos: quanto tem de caixa, o que vence, o que sangra todo mês e qual é o próximo passo.

---

## 1. De onde vêm os números (Fontes)

| Fonte | O que faz | Como funciona |
|---|---|---|
| **App do banco** | **Juiz de pagamento** | É onde você confere o valor final antes de pagar qualquer fatura. O app sempre manda no dinheiro real. |
| **Pierre (Open Finance)** | **Lanterna automática** | Robô no servidor que puxa seus saldos (Inter, C6, etc.) e extratos recentes para você não precisar digitar tudo na mão. |
| **João (Manual)** | **Controle e exceções** | Contas e dívidas que o Pierre não enxerga (como Nubank, PicPay, parcela do carro, família), ou quando você quer cravar um número. |

---

## 2. A regra de ouro do Travamento (`locked=1` / `source=joao`)

Se você corrigir um saldo ou valor na tela (ou pedir para a A.N.A./Midas registrar um valor seu):

- **O que você trava fica travado.** O sync do Pierre **nunca** esmaga ou altera o que você corrigiu.
- Dívidas manuais como **Nubank, PicPay, Carro e Pai** nunca são apagadas pelo Pierre.

---

## 3. Como funciona no dia a dia

1. **Aba é leitura:** O app **nunca** faz Pix, boleto ou mexe no seu dinheiro de verdade. É um painel para decidir, não para movimentar.
2. **Atualização rápida:** Se o Pierre estiver configurado no servidor, o botão de sincronizar puxa os saldos mais recentes. Se não estiver, você continua usando a aba normalmente com os números salvos.
3. **Midas e A.N.A.:** Quando você fala de dinheiro no chat com o Midas ou com a A.N.A., eles atualizam o mesmo painel que você vê aqui.

---

## 4. Resumo em uma frase

> **Pierre ajuda a preencher; você manda no que é real; o banco é onde você paga.**
