# JeanWake — registro de avanços

## 2026-11-08 — Protótipo 0.1.0-dev

- Projeto separado do app original, com applicationId `br.com.jeanborba.jeanwake`.
- Ambiente Android no notebook preparado com Temurin JDK 21, Android SDK 37 e Gradle 9.6.1.
- Build `assembleDebug` executado com sucesso; APK de desenvolvimento gerado localmente.
- Criado `LaunchDiagnostics.java` para registrar se as atividades de abertura estão acessíveis, sem tentar burlar permissões.
- Diagnóstico com ADB: detecção da palavra-chave funciona ao menos em certos testes, porém a atividade interna do ChatGPT não pode ser aberta por terceiros.
- Identificado bloqueio independente de *wake word*: abertura automática de sessão de voz não confirmada.
- **Pendente:** integrar motor de reconhecimento em português, obter modelo personalizado e chave de acesso sem colocá-los no repositório; fazer testes reais e publicar código reproduzível completo.
