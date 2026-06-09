# TODO — Assistente Familiar Mobile (Fami)

## Configuração e identidade
- [x] Atualizar tema de cores no theme.config.js
- [x] Gerar logo personalizada da assistente familiar
- [x] Atualizar app.config.ts com nome e logo
- [x] Configurar ícones de navegação

## Estrutura de navegação
- [x] Criar tabs: Home, Lembretes, Compras, Saúde, Estudos
- [x] Criar stack de Família e Configurações
- [ ] Criar tela de onboarding/perfil inicial

## Tela Home — Assistente
- [x] Área de conversa (histórico de comandos e respostas)
- [x] Atalhos rápidos (Lembrete, Compras, Saúde, Estudos)
- [x] Saudação personalizada por perfil e horário
- [x] Integração com servidor LLM para interpretar comandos
- [x] Resposta por voz (text-to-speech nativo)
- [x] Sugestões de comandos na tela inicial
- [ ] Botão de microfone com gravação de áudio real

## Lembretes
- [x] Tela de lista de lembretes
- [x] Criar lembrete por formulário
- [x] Editar e excluir lembretes
- [x] Notificações locais agendadas
- [x] Filtro por prioridade (visual)
- [ ] Edição inline de lembretes existentes

## Lista de Compras
- [x] Tela de lista de compras
- [x] Adicionar itens por texto
- [x] Marcar itens como comprados
- [x] Excluir itens
- [x] Botão "Enviar ao Telegram"
- [x] Barra de progresso de itens comprados
- [ ] Histórico de listas enviadas

## Saúde e Rotina
- [x] Tela de saúde com resumo do dia
- [x] Registro manual de atividade física
- [x] Registro de sono
- [x] Registro de hidratação
- [x] Dicas personalizadas baseadas nos registros (IA)
- [x] Resumo semanal (média passos e sono)
- [ ] Gráfico de histórico semanal

## Estudos (Crianças)
- [x] Tela de tutor escolar
- [x] Seleção de matéria (6 matérias)
- [x] Chat com assistente em modo infantil
- [x] Histórico de dúvidas por criança
- [ ] Modo de explicação passo a passo com gamificação

## Família e Perfis
- [x] Tela de gerenciamento de família
- [x] Criar/editar perfis (adulto e criança)
- [x] Troca de perfil ativo
- [ ] Cadastro de chalés/locais
- [ ] Reconhecimento de voz por membro (futuro)

## Configurações
- [x] Tela de configurações
- [x] Configuração do Telegram (token do bot e chat ID)
- [x] Configuração de notificações
- [x] Alternância de voz (ligar/desligar)
- [x] Sobre o app e privacidade

## Integrações
- [x] Integração com LLM do servidor para comandos
- [x] Deep link para Uber/app de corrida
- [x] Envio de mensagem ao Telegram via Bot API
- [x] Notificações locais (expo-notifications)
- [x] Text-to-speech (expo-speech)
- [ ] Gravação e transcrição de áudio por voz

## Testes
- [x] Testes unitários do family-store (12 testes passando)

## Renomeação e Avatar (Alaju)
- [x] Renomear app de Fami para Alaju
- [x] Gerar avatar da assistente (mulher negra, cabelos cacheados, olhos verdes)
- [x] Gerar novo ícone do app com identidade Alaju
- [x] Criar tela de conversa com avatar ao acionar a voz
- [x] Atualizar todas as referências de "Fami" para "Alaju" no código

## Acionamento por Voz (Wake Word)
- [x] Hook de gravação de voz com permissão de microfone
- [x] Botão de microfone que grava e transcreve via backend
- [x] Detecção de palavra-chave "Oi Alaju" na transcrição
- [x] Resposta de voz automática ao ser acionada ("No que posso ajudar?")
- [x] Indicador visual de escuta ativa (microfone pulsando)
- [x] Fluxo completo: gravar → transcrever → responder por voz e texto
