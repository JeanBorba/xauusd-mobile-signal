# JeanWake — assistente de voz Android (protótipo aberto)

Objetivo: permitir que o usuário diga **“Ei, GPT”** em português brasileiro, inclusive com a tela bloqueada, no Redmi Note 13 com Android 15/HyperOS 2.

**Estado em 08/11/2026: versão `0.5.2-dev` compilada e instalada via ADB no aparelho.** Esta versão oferece uma opção **“Ativar português sem conta (Vosk)”**, que elimina a exigência de cadastro ou AccessKey do Picovoice. **Reconhecimento real da frase Vosk ainda não validado no celular**; a conversa de voz oficial do ChatGPT pode não iniciar, porque o Android bloqueia a atividade interna que era usada no GPTWake.

## O que está implementado

- Aplicativo separado do GPTWake original, identificador Android `br.com.jeanborba.jeanwake`.
- Serviço de captura de microfone foreground, com botão **Stop** e funcionamento em tela bloqueada comprovado anteriormente com o mecanismo original.
- Dois motores opcionais para português: **Vosk offline pt-BR** (sem conta) e **Porcupine** (requer AccessKey e modelo personalizado).
- Modelo **Vosk small Portuguese 0.3** oficial, licenciado sob Apache-2.0, 31 MB compactados, incluído no APK; extrai aproximadamente 53 MB em armazenamento privado do app ao ativar. SHA-256 do ZIP: `6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7`.
- Bibliotecas Android Vosk `0.3.75` e JNA `5.18.1`.
- Reconhecimento Vosk configurado para tratar a frase como **transcrição contínua**. Pode ser menos confiável e gastar mais bateria que um detector exclusivo de palavra-chave. O texto ouvido **não é gravado em logs**.
- Opção Picovoice permanece disponível; uma AccessKey é protegida pelo Android Keystore, nunca incluída no APK.
- Apenas **um motor** utiliza o microfone de cada vez.
- Após detectar a frase, o aplicativo libera o microfone e tenta abrir um deep link do ChatGPT, **sem confirmação de que o modo de voz realmente abriu**.

## Experimento v0.5.2 — link de voz validado com microfone ativo

O usuário confirmou que o botão da v0.5.1 **abria apenas o ChatGPT**, sem iniciar a conversa, apesar de o atalho oficial **Voz** funcionar. Em seguida foi feito um teste ADB no mesmo Redmi Note 13:

```sh
adb shell am start -W -a android.intent.action.VIEW \
  -d 'https://chat.com/?mode=voice' -p com.openai.chatgpt \
  --es 'com.openai.feature.shortcut.impl.ShortcutInitializer.EXTRA_SHORTCUT' 'launcher_shortcut'
```

**Resultado verificado:** `Status: ok`; atividade pública do ChatGPT iniciada; `VoiceModeForegroundService` apareceu em `dumpsys activity services`; `RECORD_AUDIO: allow ... (running)` confirmado. Ao contrário do teste `ACTION_ASSIST`, **o serviço de voz e seu microfone efetivamente iniciaram**. Isso ainda não demonstra o resultado quando o comando parte do serviço JeanWake com o telefone bloqueado.

- Novo método `GptLauncher.launchChatGptVoice()` usa apenas `ACTION_VIEW` pública, URL de voz acima, pacote `com.openai.chatgpt`, identificação de origem `launcher_shortcut`, validação de handler exportado e registro da solicitação separado de confirmação de voz.
- Novo botão manual **“Testar VOZ do ChatGPT (novo)”** em **Configurar Ei, GPT**, permitido somente com o serviço JeanWake parado (Stop). Os botões anteriores permanecem apenas como alternativas de diagnóstico.
- Quando o usuário habilita explicitamente a abertura automática experimental, a detecção de `Ei, GPT` libera o microfone Vosk e tenta abrir a voz por essa rota. **O opt-in anterior não migra automaticamente para v0.5.2**: o recurso começa desligado por segurança. Persistem riscos de falsos positivos e restrições do Android 15 para abrir atividades de segundo plano com a tela bloqueada.
- **Compilação e instalação:** Gradle `BUILD SUCCESSFUL` e Android `install -r` **Success**, versão instalada `0.5.2-dev`, versionCode `10`, SHA-256 do APK debug `3778B04C024882B1E5D49CD258507C735834FFAD0DF89FD156973F5BC345DB25`.
- O aplicativo oficial do ChatGPT e o GPTWake original não foram modificados. A análise local do APK oficial para interoperabilidade **não é publicada**, apenas os arquivos-fonte originais do JeanWake.

**Próximo teste:** JeanWake `Stop` → `Configurar Ei, GPT` → `Testar VOZ do ChatGPT (novo)`. O usuário deve relatar se começa uma conversa de voz. Confirmando, poderemos testar separadamente o acionamento por fala com a tela desbloqueada e só depois com a tela bloqueada, monitorando falsas ativações. **Não habilitar abertura automática antes do primeiro teste.**

## Experimento v0.5.1 — Start with Voice e abertura normal

- O usuário confirmou que o atalho **Voz** do menu de pressão longa no ícone oficial do ChatGPT **iniciou uma conversa de voz no Redmi Note 13**.
- Os registros ADB desse acionamento mostram `ChatGptDeeplinkActivity` e depois `MainActivity`; a consulta de atalhos confirma `id=Voice` e o rótulo **Voz**.
- O método `LauncherApps.startShortcut` **não é acessível diretamente ao JeanWake**, porque `hasShortcutHostPermission` é `false` (essa permissão é reservada ao launcher padrão ou serviço de voz ativo); não alterar o launcher ou o assistente padrão.
- Segundo a [documentação oficial do ChatGPT](https://help.openai.com/en/articles/20001274-chatgpt-voice), no app móvel compatível o usuário pode habilitar **Settings > Voice > Start with Voice**, para que abrir uma conversa nova ou vazia inicie automaticamente o modo de voz. **Essa configuração ainda não foi verificada neste aparelho.**
- Implementado `GptLauncher.launchChatGptMain()`, que abre o ChatGPT por sua entrada pública **MainActivity** com validação de exportação. O botão **“Testar abrir ChatGPT normalmente”** na configuração só funciona se o JeanWake estiver parado (Stop).
- Se o usuário optou expressamente pela abertura automática experimental, o serviço pode solicitar a abertura normal após detectar `Ei, GPT` e liberar o microfone; opção **desligada por padrão** por falsos positivos. `startActivity` aceito **não equivale a sessão de voz iniciada**, especialmente com a tela bloqueada.
- A rota `ACTION_ASSIST` anterior foi mantida apenas para diagnóstico: três acionamentos manuais iniciaram brevemente `AssistantProxyActivity` e encerraram sem conversa.
- **Compilação e instalação verificadas:** APK `0.5.1-dev` versionCode `9`, SHA-256 `15CA96EBCF09B09F95F3DC5757E4A53502F5C27EAAD5AFA18C69D932E5DBDD22`; Gradle `BUILD SUCCESSFUL`, ADB `install -r` retornou `Success`. GPTWake original preservado.

**Próxima validação:** usuário verifica/ativa **Iniciar com voz**, se disponível, encerra o serviço JeanWake, toca em **Configurar Ei, GPT > Testar abrir ChatGPT normalmente** e relata se abre a voz, apenas o app ou nada. Não ativar autoabertura antes do resultado.

## Experimento v0.5.0 — rota pública do assistente

- No Redmi Note 13, `android.intent.action.ASSIST` restrita ao pacote `com.openai.chatgpt` resolve para a atividade pública `AssistantProxyActivity`. Isso evita tentar abrir a atividade interna não exportada.
- Novo método `GptLauncher.launchPublicAssist()` com validação de destino exportado e logs que distinguem **pedido aceito** de **sessão de voz confirmada**.
- Nova tela de configuração com botão **“Testar abertura do assistente ChatGPT”** (requer que o serviço de escuta esteja parado), e configuração separada **“Ativar abertura automática (experimental)”**, **desligada por padrão** porque a frase curta tem falsos positivos.
- Após detecção, se o usuário optou pela abertura experimental, o serviço libera o microfone, envia o comando `ACTION_ASSIST`, inspeciona o modo de áudio e tenta retomar a escuta apenas depois.
- **Primeiro teste controlado do comando público via ADB**: a atividade `AssistantProxyActivity` aceitou `am start` (`Status: ok`), porém não observamos ativação do microfone do ChatGPT ou uma conversa iniciada; isso **não confirma o funcionamento do assistente**. Uma tentativa de simular a tecla Back pelo ADB foi recusada pelo Android (permissão `INJECT_EVENTS`); o teste não deixou o microfone do ChatGPT ativo.
- Compilação `BUILD SUCCESSFUL`; APK debug `0.5.0-dev`, versionCode 8, SHA-256 `DA4F837A574DC4E0832E8E0ED3A2CC274338F1EB75F939945AD9F43147F2C0AC`, `adb install -r` retornou `Success`. O GPTWake original permanece instalado.
- **Pendente:** executar o botão do próprio aplicativo (em vez do ADB) para conferir se o Android permite iniciar a conversa, e testar com tela bloqueada apenas após confirmar.

## Experimento v0.4.2 — frase curta “Ei, GPT”

- Por preferência do usuário, a frase exibida e o motor experimental foram alterados para **“Ei, GPT”**.
- O Vosk pequeno tende a transcrever a frase como `peter` ou `z peter`. O uso de gramática restrita pode reconhecer `ei z peter`, mas **também pode confundir falas comuns que mencionam GPT**. A distinção fonética **ainda não é confiável**.
- Um comparador restrito passou em **20 testes unitários de texto** e a gramática foi testada em áudio sintético no notebook; **isso não equivale a uma validação com a voz real do usuário**.
- Por segurança, o reconhecimento Vosk está em **modo de teste somente**: uma correspondência produz log de evento e retoma a escuta, **sem abrir automaticamente o ChatGPT**.
- Para descobrir o que o motor entende, o usuário pode ativar o controle **“Mostrar a interpretação local”** na tela principal. A última transcrição é apresentada apenas temporariamente, por 30 segundos, em memória; **não é persistida em logs, arquivos nem publicada**. O controle começa desligado.
- APK instalado após compilação Gradle bem-sucedida: **0.4.2-dev** (versionCode 7), SHA-256 `D422A1EE3573CBC1EADE5C396DA748A7D7A0D478AEA8C9D6A651492BE7534BC4`; GPTWake original permanece instalado.

### Próximo teste

Abra JeanWake (Dev), ative a escuta e, se desejar visualizar temporariamente a transcrição, habilite o diagnóstico local. Diga “Ei, GPT” em local calmo e confira se aparece a interpretação na tela e se o registro de evento aponta detecção, sem expor conversas particulares. Avaliar falsas ativações antes de habilitar abertura automática.

## Diagnóstico da versão 0.4.1-dev

O primeiro teste com voz real não produziu o evento de ativação, embora o Vosk estivesse ouvindo. Em uma **amostra de voz sintetizada** em português brasileiro, o reconhecedor transcreveu “Ei, ChatGPT” como “chat z peter”. Por isso, o comparador da v0.4.1 aceita variantes fonéticas específicas e inclui diagnósticos de atividade de fala **sem salvar transcrições**. Foram aprovados 14 testes do comparador; o resultado com a voz real do usuário ainda precisa ser verificado.

**APK de desenvolvimento instalado:** `0.4.1-dev`, versionCode `6`; SHA-256 `58025D955C2E953F89843D8A8F41B1978CC03C9D033603E3FFC495D1ED519209`.

## Status e próximos testes

1. Abra **JeanWake (Dev) → Configurar Ei, ChatGPT → Ativar português sem conta (Vosk)**. Esse primeiro preparo extrai o modelo local e pode demorar alguns instantes.
2. Quando a interface indicar **Português sem conta: ATIVADO**, volte à tela principal e toque em **Start**.
3. Diga **“Ei, ChatGPT”** e observe se o aplicativo detectou a fala. Testar primeiro desbloqueado e depois bloqueado.
4. Examinar ADB para `JEANWAKE_VOSK_ENGINE_READY`, `JEANWAKE_VOSK_PT_WAKE_DETECTED` e falhas de captura, sem divulgar transcrições de áudio.
5. Medir bateria, falsos positivos e falhas de reinício. Interromper com **Stop** após testes.
6. Resolver a integração com uma sessão de voz oficial ou projetar assistente independente via API oficial com cobrança e credenciais próprias.

**Ainda não é uma versão final de uso diário.** Não exigir root, desabilitar proteções do Android ou publicar senhas/chaves.

## Fonte e reprodução

Código original baseado no [GPTWake](https://github.com/suddenBook/GPTWake) commit `2e31652be39b1751a6a75eac3027716b7d5286b1`. O [patch](changes.patch) deste repositório passou em `git apply --check` contra essa base; classes adicionais em [src/](src/) devem ser copiadas para `app/src/main/java/com/desmond/gptwake/` nas respectivas pastas.

O ZIP público do modelo offline pode ser obtido de [Vosk oficial](https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip) e copiado para `app/src/main/assets/vosk/vosk-model-small-pt-0.3.zip` antes do build. O modelo pt-BR Picovoice `.pv` é obtido de [seu upstream](https://github.com/Picovoice/porcupine/tree/master/lib/common).

Use **JDK 21, Gradle 9.6.1 e Android SDK 37**, e execute `gradle :app:assembleDebug`. Os fontes foram publicados; o APK permanece no notebook do proprietário, não é uma release de produção.

## Privacidade e licença

GPTWake e Vosk são distribuídos sob Apache-2.0, respeitando avisos e atribuição ao código-base; o Picovoice possui termos próprios. O reconhecimento offline Vosk não precisa enviar áudio a servidor. Não publicar credenciais, dados de log pessoais ou arquivos privados.

[Histórico](CHANGELOG.md) · [Desenvolvimento / issue #3](https://github.com/JeanBorba/xauusd-mobile-signal/issues/3).
