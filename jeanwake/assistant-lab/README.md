# JeanWake Assistant Lab — versão 0.6.0-lab

**Aplicativo separado e experimental**, com applicationId `br.com.jeanborba.assistantlab`. Não substitui nem modifica o APK JeanWake 0.5.2-dev, nem o aplicativo oficial do ChatGPT.

Objetivo: comprovar, sem root nem troca silenciosa de assistente, se um `VoiceInteractionService` selecionado pelo usuário pode criar uma `VoiceInteractionSession` com o Redmi Note 13 bloqueado. Também oferece botões **manuais**, dentro da sessão, para comparar `startVoiceActivity` e `startAssistantActivity` ao solicitar o link público de voz do ChatGPT.

## Segurança

- A instalação do laboratório **não muda o assistente padrão**. O ChatGPT permanece selecionado até o usuário solicitar e confirmar explicitamente a troca na UI do Android.
- O serviço não escuta ou grava áudio. O `RecognitionService` é apenas um stub que retorna erro; portanto, **não é um assistente pronto para uso diário**.
- O teste de saída para o ChatGPT só ocorre por um botão na sessão. O app não força desbloqueio nem tenta acessar componentes privados.
- Para restaurar o ChatGPT: abrir o laboratório e tocar em **Gerenciar assistente padrão / restaurar ChatGPT**, então selecionar ChatGPT na configuração oficial do sistema. A instalação ou seleção do laboratório é reversível.
- O JeanWake existente 0.5.2-dev já demonstrou reconhecimento local de "Ei, GPT" na tela bloqueada, mas a tentativa de abrir o ChatGPT diretamente do serviço retornou Android `START_ABORTED (102)`. A abertura da voz com tela desbloqueada já foi comprovada.

## Protocolo sugerido, com aprovação explícita do proprietário

1. Instalar este APK de laboratório separado (sem mudar papéis).
2. Confirmar que o Android reconhece o `VoiceInteractionService` e seus metadados, e que o ChatGPT ainda é o assistente padrão.
3. Somente após aprovação explícita do usuário, tocar em **Solicitar seleção no Android** e escolher o JeanWake Assistant Lab.
4. Tocar em **Mostrar sessão experimental** e conferir se aparece uma interface fornecida pelo sistema.
5. Testar acionamentos de assistente da tela bloqueada, sem inserir senha ou contornar autenticação.
6. Se a sessão abrir, comparar os dois botões de abertura do ChatGPT, analisando logs de `LAB_CHATGPT_*` e estado de microfone.
7. Restaurar imediatamente o ChatGPT como assistente padrão ao final.

## Limites

`VoiceInteractionService` facilita a integração do assistente selecionado, mas **não oferece acesso garantido à sessão de voz privada do ChatGPT**. Também não disponibiliza automaticamente o hardware de hotword OEM. A compatibilidade final depende de como Android 15/HyperOS trata o keyguard e as APIs de sessão.

Links: documentação Android `VoiceInteractionService` e `VoiceInteractionSession`; histórico no issue #3 do repositório JeanBorba/xauusd-mobile-signal.

## Estado verificado em 09/11/2026

- Compilação Gradle `assembleDebug`: **BUILD SUCCESSFUL**, APK debug independente de 2.494.310 bytes.
- SHA-256: `B20F8AF5EA9DB3F10F8974BE656179FAA687E041103A9C8E54535A4C36E0219F`.
- Caminho local: `app/build/outputs/apk/debug/app-debug.apk`.
- A tentativa de instalação USB retornou **`INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`**. O APK de laboratório **NÃO foi instalado**.
- ADB continuou conectado com serial `463435ac`.
- Assistente Android continuou `com.openai.chatgpt/com.openai.feature.assistant.impl.AssistantVoiceInteractionService`.
- O JeanWake original seguiu instalado como `0.5.2-dev`.
- Próxima etapa: com o proprietário segurando o aparelho desbloqueado, verificar se aparece um pedido para instalar por USB e, quando ele autorizar, repetir `adb install -r`. Se não surgir aviso, verificar em HyperOS `Configurações > Configurações adicionais > Opções do desenvolvedor > Instalar via USB`. Não contornar nem desativar outras proteções.
- **Não houve troca do papel ASSISTANT**. Se houver teste futuro dessa troca, dependerá de consentimento explícito do usuário dentro da interface Android.