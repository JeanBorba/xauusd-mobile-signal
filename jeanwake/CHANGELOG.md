# JeanWake — registro de avanços

## 2026-11-08 — Protótipo 0.2.0-dev (módulo pt-BR experimental)

- Criada classe `PtBrWakeDetector.java` com integração ao SDK Porcupine para `.ppn` e `.pv` externos.
- Dependência Android `ai.picovoice:porcupine-android:4.0.2` adicionada ao projeto local e permissão Internet para validação da chave.
- **Compilação `assembleDebug` concluída com `BUILD SUCCESSFUL`.**
- **Ainda não está ativado:** a classe está isolada e não substitui o serviço de escuta existente. Faltam chave, modelo de palavra-chave Android e integração do microfone.
- Não foram publicadas chaves, gravações, modelos proprietários nem arquivos de diagnóstico do usuário.

## 2026-11-08 — Protótipo 0.1.0-dev

- Projeto separado do app original, com applicationId `br.com.jeanborba.jeanwake`.
- Ambiente Android no notebook preparado com Temurin JDK 21, Android SDK 37 e Gradle 9.6.1.
- Build `assembleDebug` executado com sucesso; APK de desenvolvimento gerado localmente.
- Criado `LaunchDiagnostics.java` para registrar se as atividades de abertura estão acessíveis, sem tentar burlar permissões.
- Diagnóstico com ADB: detecção da palavra-chave funciona ao menos em certos testes, porém a atividade interna do ChatGPT não pode ser aberta por terceiros.
- Identificado bloqueio independente de *wake word*: abertura automática de sessão de voz não confirmada.

## Bloqueios pendentes para uma versão funcional

1. Obter modelo de ativação `.ppn` Android para “Ei, ChatGPT”, modelo `.pv` português e AccessKey Picovoice privada.
2. Fazer configuração segura no aplicativo, sem chave em APK/GitHub e sem competir pelo microfone com o serviço original.
3. Resolver a abertura da conversa de voz com tela bloqueada somente por interfaces compatíveis e autorizadas; alternativa é uma experiência de voz independente com API e custos separados.
4. Testar a versão inteira em dispositivo real antes de distribuí-la como release.
