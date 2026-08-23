# CoinReys

Aplicativo de gestão financeira pessoal com movimentações, contas do mês, gráfico mensal em tempo real e sonhos e metas.

## Configuração

Crie um arquivo `.env.local` a partir do `.env.example` e preencha as credenciais públicas do Supabase.

## Rodar localmente

```bash
npm install
npm run dev
```

## Publicação no Vercel

Configure no Vercel as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
