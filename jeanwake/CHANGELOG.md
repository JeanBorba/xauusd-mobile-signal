# JeanWake — avanços e limitações

## 2026-11-09 — JeanWake 0.6.4-dev: notificação validada com voz real

- APK 0.6.4-dev versionCode=12 compilado com Gradle (BUILD SUCCESSFUL), instalado em Redmi Note 13 via `adb install -r` e verificado por `dumpsys package`. APK SHA-256: `F449640BF112E0362261D1D3C5CF8A25F72055722F9A22BF44F51824C80B3F3C` (artefato local de diagnóstico, não publicado).
- Em tela desbloqueada, mantida abertura de voz por `ACTION_VIEW https://chat.com/?mode=voice` com pacote oficial `com.openai.chatgpt` e extra `launcher_shortcut`.
- Em tela bloqueada, não tenta abrir outra atividade silenciosamente. Publica notificação “Ei, GPT reconhecido” com ação **Abrir voz** e `PendingIntent` público, respeitando autenticação do Android. Novo teste manual de notificação em **Configurar Ei, GPT**; tratamento de `POST_NOTIFICATIONS` e cooldown de 15s. A resposta à frase curta continua opt-in e é reinicializada desligada ao migrar para 0.6.4.
- ADB confirmou a notificação `jeanwake_voice_pending`, com ação de abrir voz. Usuário confirmou a abertura por toque, com `voiceConfirmed=true mode=IN_COMMUNICATION` e `RECORD_AUDIO` do ChatGPT por **2min29s**. Confirmou-se a alternativa funcional de **um toque**, não a abertura hands-free sobre o keyguard.
- Os 20 testes do matcher offline passaram. O percurso completo da frase falada até a notificação na própria 0.6.4 ainda requer teste de aceitação separado.
- V0.6.1-0.6.3 Lab: sessão nativa no keyguard funcionou, mas ChatGPT não iniciou voz. Exceções específicas nas tentativas `startVoiceActivity`: `ActivityNotFoundException` (0.6.2) e `SecurityException: Starting under voice control not allowed` (0.6.3). Lab é mantido para reproduzir diagnóstico, não para uso normal.
- Nenhuma tentativa de contornar keyguard, editar APK do ChatGPT ou usar permissões privilegiadas. O usuário deve restaurar o ChatGPT como assistente padrão após os testes.



## 2026-11-08 — Teste da tela bloqueada: reconhecimento OK, atividade ABORTADA

- Redmi Note 13 com `mWakefulness=Dozing` e `Keyguard showing=true`.
- JeanWake 0.5.2-dev reconheceu “Ei, GPT” às **22:44:22**, **22:46:36**, **22:47:04**, interrompeu o Vosk e tentou abrir o link de voz.
- As três verificações após 5 segundos: **`voiceConfirmed=false mode=NORMAL`**; ChatGPT não teve captura de microfone nova.
- Android `ActivityTaskManager`: `BAL_ALLOW_SAW_PERMISSION` (sobreposição permitida), seguido de `Abort background activity starts from 10336` e **`result code=102` = `START_ABORTED`**. A solicitação feita pelo app **foi abortada**, apesar do método `startActivity()` não ter lançado exceção.
- **Bloqueio constatado:** Android/HyperOS não iniciou a atividade pública de voz nesse estado de bloqueio. Causa exata da decisão do sistema exige investigação adicional; não se deve atribuir a falta de permissão, que está concedida.
- O objetivo hands-free com a tela bloqueada **ainda não foi concluído**. Explorar integrações oficiais com ação explícita do usuário, respeitando keyguard/autenticação e restrições de segurança.
- A opção de autolançamento é experimental e pode ativar por engano; usar **Stop** quando não estiver testando. Nenhuma gravação/transcrição pessoal foi publicada.
- **Versão instalada permanece 0.5.2-dev**; apenas registros e documentação atualizados.

## 2026-11-08 — Integração automática completa COMPROVADA, tela desbloqueada

- Usuário habilitou a abertura automática experimental em JeanWake 0.5.2-dev e confirmou que dizer **“Ei, GPT”** abriu a conversa por voz oficial.
- ADB: às **22:42:31** o Vosk registrou `JEANWAKE_VOSK_PT_WAKE_DETECTED`; a intenção de voz foi enviada às **22:42:31.759**; às **22:42:36.769** a sonda registrou **`voiceConfirmed=true mode=IN_COMMUNICATION`**.
- O aplicativo oficial utilizou o microfone por aproximadamente **29 segundos**; o detector retomou a escuta às **22:43:11**.
- **PENDENTE:** repetir esse mesmo fluxo com a tela realmente bloqueada e confirmar a sessão de voz (não só evento do detector). Monitorar falsas ativações e bateria.
- Sem alteração de APK, versão instalada permanece **0.5.2-dev**. Nenhuma fala de usuário foi gravada ou publicada.

## 2026-11-08 — 0.5.2-dev: deep link de voz reproduzido no Redmi Note 13

- O usuário confirmou que o botão da v0.5.1 **abriu apenas o aplicativo**. O atalho oficial **Voz** do ChatGPT, por outro lado, abriu uma sessão.
- Investigado o pacote oficial localmente para obter os parâmetros relevantes de inicialização, sem modificar nem publicar o APK proprietário.
- Teste via ADB: `ACTION_VIEW https://chat.com/?mode=voice`, pacote `com.openai.chatgpt`, extra `com.openai.feature.shortcut.impl.ShortcutInitializer.EXTRA_SHORTCUT=launcher_shortcut` retornou `Status: ok` e iniciou `VoiceModeForegroundService` com `RECORD_AUDIO: allow (running)`.
- Implementado `GptLauncher.launchChatGptVoice()` por intent pública, validando handler exportado e distinguindo solicitação de início real da voz.
- Adicionado botão **Testar VOZ do ChatGPT (novo)** ao JeanWake, exigindo `Stop` no serviço de microfone.
- O fluxo automático experimental opcional agora chama a rota de voz após liberar o microfone. A preferência anterior não é reaproveitada: **autolançamento segue desligado**, com opt-in exigido novamente nesta versão, devido aos falsos positivos do detector curto.
- Android Gradle: **BUILD SUCCESSFUL**; APK SHA-256 `3778B04C024882B1E5D49CD258507C735834FFAD0DF89FD156973F5BC345DB25`.
- ADB `install -r`: **Success**; Android confirmou `versionName=0.5.2-dev`, `versionCode=10`; GPTWake original preservado.
- **Pendente:** validação do botão **dentro do JeanWake**, depois teste de frase curta no Android desbloqueado e com tela bloqueada. O teste ADB foi com tela acesa e não comprova lançamento por serviço em segundo plano, nem imunidade a falsos positivos.

## 2026-11-08 — 0.5.1-dev: botão de abertura normal do ChatGPT

- O usuário confirmou que o atalho oficial **Voz**, acessado por pressão longa no ícone do ChatGPT, abriu uma conversa de voz no Redmi Note 13.
- Registro ADB do mesmo teste: `ChatGptDeeplinkActivity` e posteriormente `MainActivity`; o Android publicou o atalho dinâmico `id=Voice`, `shortLabel=Voz`.
- `LauncherApps.hasShortcutHostPermission` é falso para JeanWake. O acesso ao atalho não é permitido diretamente a aplicativos comuns; manter launcher e assistente padrão sem modificações.
- Recurso oficial **Start with Voice / Iniciar com voz** documentado pela OpenAI para versões móveis compatíveis, com início automático quando o ChatGPT abre em uma conversa nova ou vazia. Ainda não validado nas preferências do aparelho.
- Adicionada rota `GptLauncher.launchChatGptMain()` usando `PackageManager.getLaunchIntentForPackage` e checagem de atividade exportada. Botão de teste **Testar abrir ChatGPT normalmente**, disponível somente quando a escuta do JeanWake está parada.
- A abertura automática após wake é opt-in e segue desativada por padrão; mesmo quando habilitada, o código registra a tentativa separadamente de uma voz realmente iniciada. A entrada pública `ACTION_ASSIST` anterior não conseguiu iniciar voz no telefone, após três acionamentos.
- Compilação Android: `BUILD SUCCESSFUL`; APK `0.5.1-dev`, versionCode `9`, SHA-256 `15CA96EBCF09B09F95F3DC5757E4A53502F5C27EAAD5AFA18C69D932E5DBDD22`.
- ADB `install -r`: **Success**; Android confirmou `versionName=0.5.1-dev`, pacote GPTWake original preservado.
- **Pendente:** usuário testar a configuração Iniciar com voz e o novo botão; abertura automática com tela bloqueada não está comprovada, e o detector pode gerar falsos positivos.

## 2026-11-08 — 0.5.0-dev: teste da rota pública ACTION_ASSIST

- Identificada por ADB a atividade `com.openai.feature.assistant.impl.AssistantProxyActivity` como destino exportado de `android.intent.action.ASSIST` no pacote oficial `com.openai.chatgpt`.
- Integração no JeanWake pelo método `GptLauncher.launchPublicAssist()`. O código não usa permissões privilegiadas ou a atividade interna `AssistantActivity` para o novo fluxo.
- Botão de teste manual disponibilizado na configuração: **“Testar abertura do assistente ChatGPT”**. O usuário precisa parar a escuta antes do teste.
- Nova preferência de abertura após detecção **desligada por padrão**, habilitada apenas por ação explícita do usuário devido aos falsos positivos já demonstrados da frase curta.
- Registrado um teste ADB de `ACTION_ASSIST`: `am start` retornou `Status: ok` e nome da atividade `AssistantProxyActivity`, mas **sem nova captura do microfone do ChatGPT** e sem sessão de voz confirmada.
- O aparelho negou a injeção de `KEYCODE_BACK` por permissão `INJECT_EVENTS`; não é necessária para o JeanWake e não será contornada.
- `BUILD SUCCESSFUL` para 0.5.0-dev. APK SHA-256: `DA4F837A574DC4E0832E8E0ED3A2CC274338F1EB75F939945AD9F43147F2C0AC`.
- `adb install -r`: **Success**, versão Android `0.5.0-dev` (versionCode 8). GPTWake original preservado.
- **Pendente:** validação do botão dentro do aplicativo com a escuta parada, teste bloqueado somente se houver sucesso, observabilidade de áudio e redução de falsos positivos.

## 2026-11-08 — 0.4.2-dev: frase curta “Ei, GPT” em modo de teste

- Usuário pediu a frase de ativação **“Ei, GPT”** no lugar de “Ei, ChatGPT”.
- Teste no notebook com fala sintetizada pt-BR: o Vosk transcreve “Ei, GPT” como `peter` ou `z peter`; a gramática restrita produziu `[unk] ei z peter` em exemplos positivos. Um exemplo negativo (“Eu gostei do GPT”) também foi reconhecido como `ei z peter`, revelando **risco real de falsos positivos**.
- Implementado vocabulário restrito no Vosk e `WakePhraseMatcher.java` atualizado; **20 testes unitários de correspondência passaram**. Isso não comprova reconhecimento confiável com a voz do usuário.
- Implementado `VoskDebugState.java` e cartão de diagnóstico local *opt-in*; texto reconhecido só é exibido em memória por 30 segundos e não é registrado em logcat nem publicado.
- **Modo experimental seguro:** uma detecção do Vosk produz apenas evento e reinicia a escuta; **a abertura automática do ChatGPT está desabilitada** até avaliar acertos e falsos positivos.
- Gradle: `BUILD SUCCESSFUL`; APK SHA-256 `D422A1EE3573CBC1EADE5C396DA748A7D7A0D478AEA8C9D6A651492BE7534BC4`; Android versionCode `7`.
- ADB `install -r` retornou `Success`, versão instalada confirmada como `0.4.2-dev`; GPTWake original preservado.
- Publicados fontes atualizados, patch reproduzível e testes na branch `jeanwake-development`.
- **Pendente:** teste com voz real e bloqueio de tela, verificação de falsos positivos e confirmação de integração com voz oficial do ChatGPT.

## 2026-11-08 — v0.4.1-dev (correção de transcrição e diagnóstico)

- Após o teste real do usuário, o ADB mostrou serviço Vosk em foreground e microfone ativo, mas **nenhum evento de reconhecimento de palavra de ativação** até 21:05 (hora local). O aplicativo não tentou abrir o ChatGPT.
- Diagnóstico reproduzido no notebook com voz sintética pt-BR de `Microsoft Maria Desktop`: o Vosk reconheceu `Ei, ChatGPT!` como `chat z peter`; outras amostras produziram `charge z peter`, `oi chat z peter` e `chat de peter`. **Este resultado não é uma transcrição da voz do usuário.**
- O comparador antigo exigia `ei`, `chat` e `gpt` explicitamente, descartando essas saídas do modelo pequeno.
- Novo comparador `WakePhraseMatcher.java` aceita essas variantes específicas, mas rejeita falas comuns como `oi chat vamos conversar`; **14 testes locais passaram**.
- Diagnóstico agora registra apenas um marcador temporal de atividade de fala, sem guardar texto reconhecido, gravação ou transcrição do usuário.
- Gradle: **BUILD SUCCESSFUL**. SHA-256 do APK debug: `58025D955C2E953F89843D8A8F41B1978CC03C9D033603E3FFC495D1ED519209`.
- Atualização ADB: **Success**, pacote Android confirmado como `0.4.1-dev` (`versionCode=6`), preservando o GPTWake original.
- **Pendente:** testar novamente com a voz real do usuário e verificar `JEANWAKE_VOSK_PT_WAKE_DETECTED`; o deep link que tenta iniciar a conversa do ChatGPT continua sem garantia de funcionar com tela bloqueada.

## 2026-11-08 — v0.4.0-dev (Vosk pt-BR sem conta)

- Identificada exigência de e-mail corporativo no cadastro Picovoice do usuário; alternativa sem cadastro criada.
- Integrado modelo de português brasileiro `vosk-model-small-pt-0.3` (31 MB compactados, 53 MB extraídos), licenciado sob Apache-2.0. SHA-256 do ZIP: `6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7`.
- Testado carregamento do modelo com Vosk Python no notebook: `VOSK_MODEL_LOAD_OK`.
- Implementado `VoskPtBrAssets.java` para verificar o ZIP e extrair com proteção contra Zip Slip e limite de tamanho, e `VoskPtBrWakeDetector.java` para reconhecimento/transcrição local sem logs da fala.
- Adicionada opção **Ativar português sem conta (Vosk)** à tela de configuração; motor original/Porcupine e Vosk selecionados de forma exclusiva, sem disputar o microfone.
- Compilação Gradle retornou **BUILD SUCCESSFUL**; APK SHA-256: `10735D83D9E7298C296A0768E65DF35B6390262344DE3A4B5F5AF8DC246D5459`.
- Atualização instalada por ADB (`install -r` retornou `Success`, Android confirmou `versionName=0.4.0-dev`, `versionCode=5`). GPTWake original preservado.
- **Pendente:** preparar o modelo no Android, testar o serviço Vosk com tela bloqueada, avaliar CPU/bateria e confirmar se o texto detectado consegue abrir conversa de voz. Pode haver falsas ativações e falhas ao transcrever o nome ChatGPT.

## 2026-11-08 — v0.3.1-dev (Picovoice opcional)

- Tela de configuração em português com armazenamento criptografado de AccessKey e importação de palavra personalizada Android `.ppn`.
- Modelo de idioma `.pv` pt-BR verificado e embutido.
- Build e instalação ADB confirmados.

## 2026-11-08 — v0.2.0-dev (validação de tela bloqueada)

- Serviço da captura original manteve microfone ativo com Android em `Dozing` sem silenciamento durante o teste ADB.
- Medido consumo de CPU relativamente alto com motor antigo; uso contínuo ainda necessita otimização.

## 2026-11-08 — v0.1.0-dev

- Projeto separado de GPTWake com applicationId próprio.
- Ambiente Java/Android e primeira compilação funcional.
- Identificada restrição Android `AssistantActivity not exported` no ChatGPT.
