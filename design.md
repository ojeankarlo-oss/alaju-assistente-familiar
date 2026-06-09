# Design — Assistente Familiar Mobile

## Identidade visual

- **Nome do app:** Assistente Familiar
- **Paleta principal:** Azul profundo (#1A3A5C) como cor primária, branco/cinza claro como fundo, verde (#22C55E) para ações concluídas e laranja (#F59E0B) para alertas.
- **Tipografia:** System font (San Francisco no iOS, Roboto no Android) — clean e legível.
- **Estilo:** Moderno, familiar, acolhedor. Cards arredondados, ícones expressivos, espaçamento generoso.

## Telas do aplicativo

| Tela | Descrição |
|---|---|
| Splash / Onboarding | Apresentação do app, escolha de perfil familiar |
| Home (Assistente) | Tela principal com botão de voz, histórico de conversa e atalhos rápidos |
| Lembretes | Lista de lembretes ativos, criar/editar/excluir |
| Lista de Compras | Lista colaborativa, adicionar por voz ou texto, enviar ao Telegram |
| Saúde & Rotina | Registro de atividade, sono, hidratação, dicas personalizadas |
| Estudos (Crianças) | Tutor escolar por matéria, histórico de dúvidas |
| Família | Gerenciar perfis, chalés e permissões |
| Configurações | Telegram, privacidade, notificações, tema |

## Fluxos principais

**Fluxo 1 — Comando por voz:**
Usuário abre app → toca botão de microfone → fala o comando → assistente processa → responde por voz e exibe resultado na tela.

**Fluxo 2 — Lista de compras:**
Usuário diz "adicionar leite na lista" → item aparece na lista → usuário toca "Enviar ao Telegram" → lista é enviada para o chat configurado.

**Fluxo 3 — Lembrete:**
Usuário diz "me lembre de tomar remédio amanhã às 8h" → assistente confirma → notificação agendada → dispara no horário.

**Fluxo 4 — Corrida:**
Usuário diz "chamar Uber" → assistente pergunta destino → usuário confirma → app abre Uber com destino preenchido.

**Fluxo 5 — Ajuda escolar:**
Criança diz "me ajuda com divisão" → assistente explica passo a passo → propõe exercício → registra progresso.

## Cores do tema

- primary: #1A3A5C (azul escuro)
- secondary: #2E86C1 (azul médio)
- accent: #F59E0B (laranja)
- background: #F8FAFC (cinza muito claro)
- surface: #FFFFFF
- foreground: #1A202C
- muted: #718096
- success: #22C55E
- error: #EF4444
- border: #E2E8F0
