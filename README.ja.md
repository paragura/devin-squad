# 🐝 devin-squad

**AIのチームと相談し、ゴールを並列タスクに分けてDevinに任せ、結果を確認してからマージする。**

[English](README.md) · 日本語

devin-squadは、Devin CLIを使うローカルのTypeScriptアプリケーションです。
ブラウザーやSlackでペルソナと会話し、コードの変更はタスクごとに分離したGit Worktreeで実行できます。
各runには、タスクの結果・ログ・差分・レポートが残ります。

> コミュニティプロジェクトです。Cognition / Devinの公式製品ではなく、提携・公認を受けたものでもありません。

## できること

- **チームと会話する：** Markdownでメンバーの役割や話し方を定義。共有ルームでは、話題に合う最大2人をラウンドごとに選んで応答します。
- **会話を整理する：** ルームと個別のペルソナを切り替えられます。個別会話の履歴はページを再読み込みしても復元されます。
- **作業を並列に進める：** plannerがタスクを提案し、workerが別々のWorktreeで実行。依存タスクには先行タスクの変更を引き継ぎます。
- **結果を見てから取り込む：** 回答・差分・ログ・レポートを確認できます。マージはCLIで明示的に実行します。
- **Slackからも使う：** メンション、通常の会話への応答、テキスト添付、進捗通知に対応。追加権限でレポートのアップロードやチャンネルCanvasも利用できます。

## 目次

- [インストール](#インストール)
- [Web UIを起動する](#web-uiを起動する)
- [Slack Appを作る](#slack-appを作る)
- [ペルソナ](#ペルソナ)
- [計画・実行・マージ](#計画実行マージ)
- [設定](#設定)
- [現在の対応範囲](#現在の対応範囲)
- [困ったときは](#困ったときは)
- [データの保存先と開発](#データの保存先と開発)

## インストール

### 1. 必要なものを確認する

- **Node.jsとnpm：** Node 22以降を推奨します。パッケージの最低要件はNode 20ですが、`.env`の自動読み込みには20.12以降が必要です。
- **Git：** 作業対象のリポジトリには、少なくとも1つコミットが必要です。workerがコミットするため、そのリポジトリでGitのユーザー名・メールアドレスも設定してください。
- **インストール・認証済みのDevin CLI：** [Devinの公式ドキュメント](https://docs.devin.ai/)に従ってインストールしてください。
- **macOSまたはLinux：** 子プロセスを含む終了処理はこれらの環境を対象にしています。Windowsは動作未検証です。

```bash
node --version
npm --version
git --version
devin version
devin auth login
devin auth status
```

利用できるモデルや料金・利用枠はDevinアカウントに依存します。
このプロジェクトにDevinの契約は含まれず、特定モデルの無料利用も保証しません。

### 2. ソースからインストールする

```bash
git clone https://github.com/paragura/devin-squad.git
cd devin-squad
npm ci
npm run build
npm link
devin-squad help
```

`npm link`で`devin-squad`コマンドをPATHに登録します。
リンクせずに使う場合は、以降のコマンドの`devin-squad`を
`node /absolute/path/to/devin-squad/dist/cli.js`に置き換えてください。

### 3. チームメンバーを追加する

クローンしたdevin-squadのディレクトリで実行します。

```bash
mkdir -p "$HOME/.devin-squad/personas"
cp -n examples/personas/*.md "$HOME/.devin-squad/personas/"
devin-squad personas
```

レビュアー、フロントエンド担当、リサーチャー、秘書のサンプルが入っています。
`cp -n`は、同名の既存ファイルを上書きしません。役割や口調は自由に編集できます。

## Web UIを起動する

`--repo`に、workerの作業対象となるリポジトリを指定します。

```bash
devin-squad serve --repo /absolute/path/to/your-project --port 3333
```

[http://127.0.0.1:3333](http://127.0.0.1:3333)をブラウザーで開きます。Slackの設定は不要です。

1. 左側から「みんなのルーム」または個別のペルソナを選びます。
2. メッセージを送ります。Enterで送信、Shift+Enterで改行。日本語変換の確定では送信されません。
3. コードの作業を任せるときは、右の「実行パネル」を開きます。ゴールから計画を作り、タスクの内容を確認・編集して実行します。
4. タスクの進捗を確認し、回答・差分・ログ・レポートを開きます。

現在のUI言語は日本語です。スマートフォンでは左右のパネルを開閉できます。
送信に失敗したメッセージは再送でき、別の会話へ切り替えても返信が混ざりません。
個別会話の履歴はリポジトリとペルソナ単位で保存されます。
runの履歴も再読み込み後に確認でき、サーバー再起動で途切れたrunは中断として表示されます。

サーバーはループバック限定で待ち受け、Host・Originを検証します。LAN・インターネットへの公開には対応していません。
workerの既定権限は`bypass`です。コードを変更する前に[実行権限とモデル](#実行権限とモデル)を確認してください。

## Slack Appを作る

Slack連携は**Socket Mode**を使います。devin-squadからSlackに接続するため、公開サーバー、EventsのRequest URL、ngrokなどのトンネルは不要です。
メッセージを受け取る間は、ローカルの`slack`プロセスを起動しておきます。
公式の説明は[Socket Modeガイド](https://docs.slack.dev/apis/events-api/using-socket-mode/)を参照してください。

### 1. アプリを作成する

[Your Apps](https://api.slack.com/apps)で**Create New App → From a manifest**を選び、利用するワークスペースを指定します。
[`examples/slack-app-manifest.yaml`](examples/slack-app-manifest.yaml)の内容を貼り付け、確認して作成してください。
ワークスペースの設定によっては、管理者の承認が必要です。

このmanifestはbot、Socket Mode、公開チャンネルのイベント、下記の基本権限を設定します。トークンは含まれていません。
**From scratch**で作る場合は、名前を`devin-squad`にして、手順2〜4の設定を手動で追加してください。

### 2. Socket Modeを有効にして、アプリ用トークンを作る

アプリの設定画面で、次の操作を行います。

1. **Socket Mode**を開き、無効なら有効にします。
2. **Basic Information → App-Level Tokens**でトークンを作成します。名前は例として`devin-squad-socket`にします。
3. 権限に**`connections:write`**を追加します。
4. 発行された**`xapp-...`**をコピーします。これが`SLACK_APP_TOKEN`です。

これはSocket接続用の**アプリレベルトークン**です。メッセージ投稿に使うbotのOAuthトークンとは別物です。

### 3. botの権限を設定する

**OAuth & Permissions → Scopes → Bot Token Scopes**で、manifestの基本権限を確認します。

| Bot scope              | 用途                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `app_mentions:read`    | アプリへのメンションを受け取る                                 |
| `chat:write`           | 返信やrunの進捗を投稿する                                      |
| `chat:write.customize` | ペルソナごとの表示名・アイコンで投稿する                       |
| `channels:history`     | 公開チャンネルの直近の文脈を読み、メッセージイベントを受け取る |
| `users:read`           | ユーザーの表示名を取得する                                     |
| `reactions:write`      | 受信確認などのリアクションを付ける・外す                       |
| `files:read`           | 対応するテキスト・コード添付を読む                             |

使いたい機能に応じて、次の権限も追加します。

| 追加のBot scope   | 有効になる機能                                                       |
| ----------------- | -------------------------------------------------------------------- |
| `groups:history`  | 非公開チャンネルの文脈・メッセージ。次の手順で`message.groups`も追加 |
| `channels:manage` | run専用の公開チャンネルを作成する                                    |
| `files:write`     | runのレポートや差分ファイルをアップロードする                        |
| `canvases:write`  | チャンネルCanvasにrunのレポートを作成する                            |

**run専用チャンネルの公開範囲：** 現在の`run`は、非公開チャンネルから指示しても、専用チャンネルを**公開チャンネル**として作ろうとします。
作成に失敗した場合や`channels:manage`を付けていない場合は、指示元のチャンネルに進捗を投稿します。
非公開の会話で使うときは、runの情報を公開する意図がなければ、この追加権限を付けないでください。
ファイルやCanvasの投稿に失敗してもworkerの実行は止まらず、成果物はローカルに残ります。

必要なのはbotの権限と、アプリレベルの`connections:write`です。ユーザー用OAuth scopeは不要です。
Slack公式の[チャンネル作成](https://docs.slack.dev/reference/methods/conversations.create/)、
[投稿時の表示名・アイコン](https://docs.slack.dev/reference/methods/chat.postMessage/)、
[チャンネルCanvas作成](https://docs.slack.dev/reference/methods/conversations.canvases.create/)も参照してください。

### 4. botのイベントを購読する

**Event Subscriptions**を有効にして、**Subscribe to bot events**を確認します。

| イベント           | 用途                                                   |
| ------------------ | ------------------------------------------------------ |
| `app_mention`      | 明示的なコマンドやペルソナへのメンション               |
| `message.channels` | 公開チャンネルで、通常の発言にも反応する               |
| `message.groups`   | 任意：非公開チャンネルでの発言。`groups:history`も必要 |

manifestには最初の2つが含まれます。追加・変更したら保存してください。
Socket Modeが有効なら、イベントはSocket経由で届くためRequest URLは不要です。

### 5. ワークスペースにインストールして、bot用トークンをコピーする

**OAuth & Permissions → Install to Workspace**、または**Reinstall to Workspace**からインストールし、権限を許可します。
**Bot User OAuth Token**として表示される**`xoxb-...`**をコピーしてください。これが`SLACK_BOT_TOKEN`です。

インストール済みのアプリにscopeを追加した場合は、追加権限を反映するために再インストールします。
イベント購読の変更も保存してください。

### 6. ローカルに2種類のトークンを設定する

devin-squadを**起動するディレクトリ**に、`.env`を作成します。

既存の`.env`を上書きしないように、[`.env.example`](.env.example)をひな形として使えます。
実際のトークンへの置き換えは、ローカルの`.env`だけで行ってください。

```dotenv
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-level-token
```

**`.env`は`--repo`の指定先ではなく、プロセスの起動ディレクトリから読み込みます。**
クローンしたdevin-squadから起動して別のリポジトリを`--repo`に指定するなら、`.env`はdevin-squad側に置きます。
このリポジトリでは`.env`をGit管理対象から除外しています。別のプロジェクトに置く場合は、そのプロジェクトでも除外してください。
環境変数としてexportしても構いません。実際のトークンをmanifestに書いたり、コミットしたりしないでください。

### 7. botを起動して、チャンネルに招待する

```bash
# .envを置いたディレクトリで実行します。
devin-squad slack --repo /absolute/path/to/your-project
```

`slack bot connected`が表示されたら、利用するSlackチャンネルのインテグレーション設定からアプリを追加するか、次のコマンドで招待します。

```text
/invite @devin-squad
```

非公開チャンネルにも明示的な招待が必要です。アプリを別名にした場合は、実際のメンション名に置き換えてください。
まずは次のコマンドで動作を確認できます。

```text
@devin-squad personas
@devin-squad strict-reviewer この変更でテストすべき観点を教えて
@devin-squad plan パーサーのテストを追加して、ドキュメントも更新して
@devin-squad run パーサーのテストを追加して、ドキュメントも更新して
@devin-squad status
```

`plan`はタスクの提案までです。**`run`は計画後、そのままworkerを起動します。**
Web UIのような、計画を確認してから実行する操作は挟みません。
`run`の専用チャンネルでは、`status`または「いまどうなってる？」のようなメンションで状態を確認できます。
計画・実行が長引いている間も定期的に経過を投稿し、失敗理由は専用チャンネルと指示元の両方に表示します。

同じSlack Appトークンでbotを二重起動するとイベントの担当が不安定になるため、現在は2つ目の起動をエラーにします。
更新後は古い`slack`プロセスを終了してから、1つだけ起動してください。

### 8. 通常の会話にも反応させるかを選ぶ

既定ではambientモードが有効です。通常のメッセージにもルーターが反応し、0〜2人のペルソナを選びます。
応答後、judgeが「続ける」「終える」「人間に確認する」を判断します。
人間の判断が必要なら秘書が質問をまとめ、最大8ラウンドで議論を終了します。
返信が不要と判断されたメッセージには反応しないこともあります。

メンションされたときだけ動かすには、次のように起動します。

```bash
devin-squad slack --repo /absolute/path/to/your-project --no-ambient
```

Slackの会話ログをブラウザーでも見るには、同じOSユーザー・データ保存先で、別ターミナルから`serve`も起動します。
記録されたチャンネルがルームとして表示されます。現在の表示名はSlackのチャンネルIDです。
**Web上で送ったメッセージはローカル保存のみで、Slackには投稿されません。**
また、このログ表示はSlack全体のアーカイブではありません。

## ペルソナ

ペルソナは、簡単なフロントマターを持つMarkdownファイルです。

```markdown
---
name: strict-reviewer
emoji: 🛡️
description: 正しさ・セキュリティ・テスト不足を確認するレビュアー
slackName: レビュアー
icon: :shield:
# model: your-model-id
# permissionMode: accept-edits
---

あなたは丁寧なコードレビュアーです。指摘には根拠と具体的な修正案を添えてください。
返答は簡潔にし、ユーザーが使っている言語に合わせてください。
```

ヘッダーは単一行の`key: value`を読む簡易形式で、完全なYAMLではありません。
`icon: :shield:`のような値は引用符で囲まずに記載してください。`icon`にはHTTPSの画像URLも指定できます。
`description`は、ルーターが応答するメンバーを選ぶために使います。

| 保存先                              | 適用範囲                                             |
| ----------------------------------- | ---------------------------------------------------- |
| `~/.devin-squad/personas/*.md`      | 全リポジトリで利用                                   |
| `<repo>/.devin-squad/personas/*.md` | そのリポジトリ限定。同名のグローバルペルソナより優先 |

```bash
devin-squad personas --repo /absolute/path/to/your-project
devin-squad persona new my-reviewer --repo /absolute/path/to/your-project
devin-squad persona new my-reviewer --global
devin-squad talk strict-reviewer --repo /absolute/path/to/your-project
devin-squad talk strict-reviewer "レビューの観点を整理して" --repo /absolute/path/to/your-project
```

CLI・Webの個別会話は、リポジトリ単位のペルソナセッションを再開します。
Slack・共有ルームでは、代わりに直近の会話を文脈として渡します。
現在、個別会話は「1リポジトリ・1ペルソナにつき1つ」で、名前付きの話題を複数作る機能はありません。

ペルソナとの会話プロセスは、専用の会話ディレクトリで動きます。
`--repo`はペルソナやセッションの範囲を決めるもので、会話の作業ディレクトリを対象リポジトリにする指定ではありません。
コードの相談ではファイルの絶対パスを伝え、実装作業はsquadのタスクとして任せると分かりやすくなります。

## 計画・実行・マージ

```bash
devin-squad plan --repo /absolute/path/to/your-project \
  --goal "パーサーのテストを追加して、ドキュメントも更新して" --out tasks.json

devin-squad run --repo /absolute/path/to/your-project --tasks tasks.json --dry-run
devin-squad run --repo /absolute/path/to/your-project --tasks tasks.json --concurrency 3

# レポート・差分を確認してから、成功した変更をマージします。
devin-squad merge --repo /absolute/path/to/your-project --run latest
```

`tasks.json`を自分で書いても構いません。

```json
{
  "goal": "ヘルスチェックAPIを追加して使い方を書く",
  "tasks": [
    {
      "id": "health-api",
      "title": "ヘルスチェックAPIを追加",
      "prompt": "既存の構成に合わせてヘルスチェックAPIを追加してください。テストを追加し、関連するテストを実行してください。",
      "dependsOn": []
    },
    {
      "id": "health-docs",
      "title": "APIの使い方を書く",
      "prompt": "追加されたヘルスチェックAPIの実装とテストを読み、ルート・レスポンス・リクエスト例をドキュメントに追記してください。",
      "dependsOn": ["health-api"]
    }
  ]
}
```

- IDは1〜64文字の英数字・ハイフン・アンダースコアで、先頭は英数字です。重複ID、存在しない依存先、循環依存は実行前にエラーになります。
- run開始時のコミット済みHEADを固定して使います。**未コミットの変更はWorktreeにコピーされません。** 独立タスクは並列に、依存タスクは先行タスクの成功したコミットを取り込んでから実行します。
- 依存成果のマージが競合した場合、そのタスクは失敗し、後続の依存タスクはスキップされます。独立タスクは継続します。差分には各タスク自身の変更を記録します。
- `merge`は、選んだrunの「成功・変更あり」のタスクを、**対象リポジトリで現在チェックアウトしているブランチ**へ依存順に取り込みます。取り込み済みのコミットは飛ばし、競合時は停止します。タスクを1つずつ選ぶ確認画面はありません。一部だけ取り込みたい場合はGitで操作してください。
- 失敗や途中成果もレポート・Worktreeに残ります。Devinの終了コードが成功でも、生成したコードがテストを通ることまで独立して保証するものではありません。

## 設定

### 主なオプション

| オプション            | 動作・既定値                                           |
| --------------------- | ------------------------------------------------------ |
| `--repo <path>`       | 対象リポジトリ。省略時は現在のディレクトリ             |
| `--concurrency <n>`   | 正の整数。**runごとに**既定3 worker                    |
| `--timeout <minutes>` | 正の数。Devin呼び出しごとに既定30分、`talk`は10分      |
| `--model <id>`        | worker・planner・共有会話のモデル。既定`swe-2-medium`  |
| `--router-model <id>` | Slackのrouter/judge専用モデル。省略時は`--model`       |
| `--mode <mode>`       | workerの権限モード。既定`bypass`                       |
| `--sandbox`           | workerのOSサンドボックスを有効にし、`autonomous`を選ぶ |
| `--persona <name>`    | CLI `run`の既定ペルソナ。タスク自身の`persona`が優先   |
| `--keep-worktrees`    | CLI `run`で、変更なしのWorktreeも残す                  |
| `--dry-run`           | CLI `run`で、Devinを起動せずタスクを検証・表示する     |
| `--out <file>`        | `plan`の出力先。既定`tasks.json`                       |
| `--port <n>`          | Webサーバーのポート。既定3333                          |
| `--no-ambient`        | Slackで明示的なメンションだけに反応する                |
| `-- <args...>`        | workerへ追加引数を渡す。空白を含む引数の区切りを保持   |

### 実行権限とモデル

workerの既定値`bypass`は、Devinの`dangerous`に対応し、ツールを自動承認します。
用途に合わせて権限を選んでください。WorktreeはGit上の変更を分離する仕組みであり、OSの権限境界ではありません。
`--sandbox`が適用されるのはworkerで、すべての会話・planner呼び出しをまとめて隔離するオプションではありません。
ペルソナの`permissionMode`はworkerのモードより優先しますが、指定したsandbox引数は引き続き渡されます。

| 既存のsquad側の名前 | 現在のDevin CLIに渡す値 |
| ------------------- | ----------------------- |
| `bypass`            | `dangerous`             |
| `normal`            | `auto`                  |
| `autonomous`        | `smart`                 |

それ以外のモード名はそのまま渡します。
plannerは`accept-edits`、ペルソナの会話は既定`accept-edits`、router/judgeは`normal`を使います。
plannerは対象のチェックアウト上で編集権限を持って動くため、`plan`は読み取り専用を強制するサンドボックスではありません。

利用可能なモデルは`devin models list`で確認し、`--model <id>`で既定値を変更できます。
worker・共有会話の応答では、ペルソナ自身の`model`が優先します。
個別の`talk`・Web会話では、ペルソナの`model`、未指定ならDevin自身の既定モデルを使います。
一般の`--model`指定は、これらの個別会話には適用されません。

## 現在の対応範囲

- Slackの別チャンネルは文脈を分離して並行処理できます。同じチャンネル内の処理は順番に進めます。Slackのスレッドごとの話題分離は未対応です。
- Web UIは既存ルームの切り替えに対応していますが、ルームの新規作成・名前変更・ルーム別の参加メンバー指定は未対応です。個別会話も1リポジトリ・1ペルソナにつき1つです。
- Webの返信はSlackへ投稿されません。Slack側の文脈は直近のSlack履歴から取得し、ローカルのログ表示は双方向同期ではありません。
- 添付は対応するテキスト・コードファイルが対象です。上限は200,000バイト、取り込む内容は1ファイルあたり最大10,000文字です。画像・PDFの内容解析は未対応です。
- プロセスの再起動で中断したworkerを自動再開する機能はありません。新しいrunを始める前に、保存されたWorktreeと結果を確認してください。
- Slackのコマンドからローカルのworkerを実行できます。現状、bot独自のユーザー許可リストや`run`の承認ステップはありません。

## 困ったときは

| 症状                                       | 確認すること                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `devin-squad`が見つからない                | `npm link`を実行するか、Nodeで`dist/cli.js`の絶対パスを指定                                  |
| `devin`が見つからない・認証に失敗する      | アプリを起動するシェルで`devin version`と`devin auth status`を確認                           |
| モデルを利用できない                       | `devin models list`を確認し、対象に応じて`--model`かペルソナの`model`を指定                  |
| ペルソナがいない・共有会話が反応しない     | サンプルを配置し、`devin-squad personas --repo ...`で確認。返信不要と判断される場合もある    |
| Slackのトークンエラー                      | Botは`xoxb-...`、Appは`connections:write`付きの`xapp-...`か確認                              |
| `.env`が読まれていないように見える         | 起動ディレクトリとNodeのバージョンを確認。`--repo`基準では読み込まない                       |
| Slackで何も受信しない                      | `slack`プロセス、Socket Mode、保存したbotイベント、インストール、チャンネルへの招待を確認    |
| `already running (pid ...)`                | 同じSlack Appのbotがすでに起動中。表示された古いプロセスを終了してから1つだけ起動            |
| `planning…`から動かない                    | 専用チャンネルで`@devin-squad status`。タイムアウト時は失敗理由とplannerログの保存先を確認   |
| メンションだけ動いて通常の発言に反応しない | `message.channels` / `message.groups`、history権限、`--no-ambient`を確認                     |
| `missing_scope`                            | 機能に必要なscopeを追加し、アプリを再インストール                                            |
| run専用チャンネル・Canvasの作成に失敗する  | 追加権限を確認。チャンネル名の重複や使用できない名前などでも、投稿先は指示元チャンネルに戻る |
| Gitのコミット・Worktree作成に失敗する      | 最初のコミット、Gitのユーザー設定、書き込み権限、表示されたタスクエラーを確認                |
| マージ競合                                 | Gitで解消または中止。解消してコミットしたら、残りの取り込みを再実行                          |
| 別の端末からWeb UIを開けない               | 仕様どおり。サーバーはループバック限定                                                       |

## データの保存先と開発

既定のデータ保存先は`~/.devin-squad`です。`DEVIN_SQUAD_HOME`に**絶対パス**を設定すると変更できます。
Web UIとSlackでログを共有する場合は、両方に同じ保存先を指定してください。

| データディレクトリ内のパス                  | 内容                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `personas/`                                 | グローバルのペルソナMarkdown                                                     |
| `channels/<id>.jsonl`                       | 共有ルーム・Slackのログ。`dm_...`は範囲を分けた個別会話                          |
| `chat/<repo-hash>/<persona-hash>/`          | 継続する個別会話のセッション参照                                                 |
| `worktrees/<repo-hash>/<run-id>/<task-id>/` | workerの作業場所。ブランチは`squad/<run-id>/<task-id>`                           |
| `runs/<repo-hash>/<run-id>/`                | `tasks.json`、`results.json`、`report.md`、Web起動runの状態など                  |
| `runs/.../<task-id>/`                       | 生成された`output.md`、`diff.patch`、`log.txt`、`meta.json`、`session.atif.json` |
| `devin-home/`                               | 隔離したDevinセッションデータ。認証情報・信頼設定は通常のDevin保存先からリンク   |
| `locks/`、`slack-events/`                   | 会話処理の調整とSlackイベントの重複防止記録                                      |

新しいrunは既存のWorktreeを上書きしません。変更なしのWorktreeは、明示的に保持しない限り削除します。
変更があるものや調査用に残す失敗時のWorktreeは保持します。旧形式のrunメタデータも読み取れます。
削除するセッションは、完了した使い捨て呼び出しのIDに限定し、継続会話や実行中のセッションロックには触れません。

### 非公開データをGitに含めない

このリポジトリでは、`.env`とその派生ファイル（ダミー値だけの`.env.example`を除く）、
`.devin-squad/`配下の実行データ、ログ、セッションのエクスポート・データベースをGitの管理対象から除外します。
`.devin-squad/personas/`のプロジェクト用ペルソナは共有できるため、プロンプトに非公開情報がないか確認してください。
`DEVIN_SQUAD_HOME`を別の場所に変更した場合は、その保存先も個別に除外してください。
ほかのリポジトリには、この除外設定は引き継がれません。

レポートや差分には、ソースコード・指示内容・Slackの会話が含まれることがあります。
コミット前に追加対象を確認してください。すでにGitで追跡しているファイルや強制追加したファイルは、除外設定では保護されません。
個人のメールアドレスを公開したくない場合は、GitHubが提供する`noreply`アドレスをコミットに使ってください。
実際の認証情報を公開してしまった場合は、失効・再発行が必要です。ファイルの削除や履歴の書き換えだけでは安全には戻りません。

### テスト

```bash
npm test
```

ビルド後、一時的なGitリポジトリと偽のDevinコマンドで統合テストを実行します。
実際のDevin・Slackへの接続は不要です。依存成果、競合、会話の継続、タイムアウト、終了処理、
入力検証、HTTP保護、重複防止、旧形式の結果などを確認します。

ブラウザーテストはPython PlaywrightとChromiumを用意し、2つのターミナルで実行します。

```bash
# 初回のみ、ブラウザーテスト用の依存関係を入れます。
python3 -m pip install playwright
python3 -m playwright install chromium

# ターミナル1：このリポジトリで実行します。
node tests/ui-server.mjs

# ターミナル2：このリポジトリで実行します。
python3 tests/ui_smoke.py
```

オフラインのテスト用サーバーは`127.0.0.1:43337`で起動します。
スクリーンショットは`/tmp/devin-squad-desktop.png`と`/tmp/devin-squad-mobile.png`に保存します。

runを読むAPIは`GET /api/runs`、`GET /api/run?run=<id>`、
`GET /api/artifact?run=<id>&file=report.md`などです。
タスクの成果物には`task=<id>`と許可されたファイル名が必要です。
会話履歴のAPIでは`persona=<name>`で現在のリポジトリの個別会話を指定できます。
POSTの本文はJSON形式、上限1 MiBです。

## ライセンス

[MIT](LICENSE)。
