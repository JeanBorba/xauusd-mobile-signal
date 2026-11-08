# JeanWake — assistente pessoal por voz para Android

Projeto experimental para que o usuário do Redmi Note 13 / HyperOS 2 possa dizer **"Ei, ChatGPT"** com a tela bloqueada e iniciar uma conversa.

**Situação em 8/11/2026:** versão experimental **0.2.0-dev compilada** no notebook. A detecção em português ainda **não foi integrada à escuta do aplicativo**. A abertura automática da sessão do ChatGPT com tela bloqueada **ainda não está resolvida**. Não há APK de produção ou release funcional para instalar.

## Avanços concretos

- Fork de desenvolvimento local do [GPTWake](https://github.com/suddenBook/GPTWake), respeitando sua licença e atribuição.
- Identificador Android próprio `br.com.jeanborba.jeanwake`, sem substituir o GPTWake original.
- Compilação `assembleDebug` concluída duas vezes com sucesso usando JDK 21, Gradle 9.6.1 e SDK Android 37.
- Diagnóstico publicado: [LaunchDiagnostics.java](src/LaunchDiagnostics.java), inspeção de intents e limites de atividades privadas do ChatGPT.
- Módulo experimental [PtBrWakeDetector.java](src/PtBrWakeDetector.java) conectado ao SDK Porcupine Android 4.0.2, compilado, mas **ainda isolado do serviço de escuta**. Ele requer AccessKey privada, modelo `.ppn` Android e modelo `.pv` em português.
- Script de build [build-jeanwake.ps1](build-jeanwake.ps1) publicado para o workspace local já preparado.

## Diagnóstico técnico

- O serviço do GPTWake detectou a frase `open sesame` em um teste.
- O ChatGPT não exporta sua atividade interna `com.openai.voice.assistant.AssistantActivity`; tentativas diretas de aplicativos terceiros são bloqueadas.
- Um deep link alternativo pode abrir o aplicativo sem iniciar a conversa por voz.
- Portanto, **não basta melhorar a palavra-chave** para concluir o projeto.

## Próximas tarefas

1. Configuração segura do Porcupine (obter modelo personalizado pt-BR e credencial sem incluí-la no repositório).
2. Gerenciar escuta com um só capturador de microfone, botão Stop, reinicialização e segurança.
3. Abrir sessão de conversa por integração pública suportada, ou oferecer interface própria de voz com API separada e custos explicitados.
4. Testar o fluxo completo com tela apagada, reinícios, bateria e permissões do HyperOS.
5. Publicar código completo de build reproduzível, APK e instruções somente após validação.

## Privacidade

Não incluir credenciais, gravações, identificadores exclusivos do aparelho, logs privados ou backups. Não exige root, não contorna permissões do Android nem expõe ADB à internet.

## Publicações

Esta pasta contém **módulos novos e documentação**, e não a árvore completa do projeto Android. O código-base está no upstream GPTWake, a cópia modificada está no notebook. Histórico em [CHANGELOG.md](CHANGELOG.md); trabalho restante em [issue #3](https://github.com/JeanBorba/xauusd-mobile-signal/issues/3).
