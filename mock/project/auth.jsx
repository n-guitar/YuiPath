// Auth screens — Login / Signup / Forgot password (mock).
// Rendered by App when authView !== null. No real authentication;
// submit actions just transition state.

function AuthShell({ view, onView, onAuthenticated }) {
  return (
    <div className="pw-auth" data-screen-label={
      view === "login"  ? "Login"
    : view === "signup" ? "Signup"
    : view === "forgot" ? "ForgotPassword"
    : view
    }>
      <div className="pw-auth__card">
        <div className="pw-auth__brand">
          <YuiPathMark size={72}/>
          <YuiPathWordmark height={52}/>
        </div>
        {view === "login"  && <LoginForm  onView={onView} onAuthenticated={onAuthenticated}/>}
        {view === "signup" && <SignupForm onView={onView} onAuthenticated={onAuthenticated}/>}
        {view === "forgot" && <ForgotForm onView={onView}/>}
      </div>
      <div className="pw-auth__foot">
        <span>© 2026 n-guitar · Apache 2.0</span>
        <span className="pw-auth__foot-sep">·</span>
        <a href="https://github.com/n-guitar/YuiPath" target="_blank" rel="noopener noreferrer" className="pw-auth__foot-star">
          <span aria-hidden="true">⭐</span> Star on GitHub
        </a>
        <span className="pw-auth__foot-sep">·</span>
        <a href="#" onClick={(e) => e.preventDefault()}>利用規約</a>
        <span className="pw-auth__foot-sep">·</span>
        <a href="#" onClick={(e) => e.preventDefault()}>プライバシー</a>
      </div>
    </div>
  );
}

function LoginForm({ onView, onAuthenticated }) {
  // Pre-fill with the mock current user so the demo path is one-click.
  const me = (window.RESOURCES || []).find(r => r.id === CURRENT_USER_ID);
  const defaultEmail = me ? `${(me.enName || "user").toLowerCase().replace(/\s+/g, ".")}@example.com` : "";
  const [email, setEmail] = React.useState(defaultEmail);
  const [password, setPassword] = React.useState("••••••••");
  const [showPw, setShowPw] = React.useState(false);
  const [remember, setRemember] = React.useState(true);

  const submit = (e) => {
    e.preventDefault();
    onAuthenticated();
  };

  return (
    <form className="pw-auth__form" onSubmit={submit}>
      <label className="pw-auth__field">
        <span className="pw-auth__field-label">メールアドレス</span>
        <input
          type="email" required autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"/>
      </label>

      <label className="pw-auth__field">
        <span className="pw-auth__field-label-row">
          <span className="pw-auth__field-label">パスワード</span>
          <button type="button" className="pw-auth__link pw-auth__link--inline"
            onClick={() => onView("forgot")}>
            お忘れですか？
          </button>
        </span>
        <div className="pw-auth__pw-wrap">
          <input
            type={showPw ? "text" : "password"} required
            value={password}
            onChange={(e) => setPassword(e.target.value)}/>
          <button type="button" className="pw-auth__pw-toggle"
            onClick={() => setShowPw(s => !s)}>
            {showPw ? "隠す" : "表示"}
          </button>
        </div>
      </label>

      <label className="pw-auth__check pw-auth__check--inline">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}/>
        <span>このデバイスでログイン状態を保持</span>
      </label>

      <button className="pw-btn pw-btn--primary pw-auth__submit" type="submit">
        ログイン
      </button>

      <div className="pw-auth__alt">
        アカウントをお持ちでない方は{" "}
        <button type="button" className="pw-auth__link" onClick={() => onView("signup")}>
          サインアップ
        </button>
      </div>
    </form>
  );
}

function SignupForm({ onView, onAuthenticated }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [agree, setAgree] = React.useState(false);

  const pwTooShort = password.length > 0 && password.length < 8;
  const pwMismatch = confirm.length > 0 && confirm !== password;
  const valid = name.trim() && email.trim() && password.length >= 8 && confirm === password && agree;

  const submit = (e) => {
    e.preventDefault();
    if (valid) onAuthenticated();
  };

  return (
    <form className="pw-auth__form" onSubmit={submit}>
      <label className="pw-auth__field">
        <span className="pw-auth__field-label">名前</span>
        <input
          type="text" required autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="山田 太郎"/>
      </label>

      <label className="pw-auth__field">
        <span className="pw-auth__field-label">メールアドレス</span>
        <input
          type="email" required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="taro@example.com"/>
      </label>

      <label className="pw-auth__field">
        <span className="pw-auth__field-label">パスワード</span>
        <input
          type="password" required
          value={password}
          onChange={(e) => setPassword(e.target.value)}/>
        {pwTooShort
          ? <span className="pw-auth__error">8 文字以上で設定してください</span>
          : <span className="pw-auth__hint">8 文字以上、大小英数字を含めることを推奨</span>}
      </label>

      <label className="pw-auth__field">
        <span className="pw-auth__field-label">パスワード（確認）</span>
        <input
          type="password" required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}/>
        {pwMismatch && <span className="pw-auth__error">パスワードが一致しません</span>}
      </label>

      <label className="pw-auth__check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}/>
        <span>
          <a href="#" onClick={(e) => e.preventDefault()}>利用規約</a>と
          <a href="#" onClick={(e) => e.preventDefault()}>プライバシーポリシー</a>
          に同意します
        </span>
      </label>

      <button className="pw-btn pw-btn--primary pw-auth__submit" type="submit" disabled={!valid}>
        アカウントを作成
      </button>

      <div className="pw-auth__alt">
        既にアカウントをお持ちの方は{" "}
        <button type="button" className="pw-auth__link" onClick={() => onView("login")}>
          ログイン
        </button>
      </div>
    </form>
  );
}

function ForgotForm({ onView }) {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (email.trim()) setSent(true);
  };

  return (
    <form className="pw-auth__form" onSubmit={submit}>
      <h1 className="pw-auth__title">パスワード再設定</h1>
      {!sent ? (
        <>
          <p className="pw-auth__subtitle">登録済みのメールアドレスにリセットリンクを送信します</p>

          <label className="pw-auth__field">
            <span className="pw-auth__field-label">メールアドレス</span>
            <input
              type="email" required autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"/>
          </label>

          <button className="pw-btn pw-btn--primary pw-auth__submit" type="submit">
            リセットリンクを送信
          </button>
        </>
      ) : (
        <div className="pw-auth__sent">
          <span className="pw-auth__sent-icon"><Icon name="check" size={18}/></span>
          <div className="pw-auth__sent-text">
            <strong>{email}</strong> 宛にリセット用のリンクを送信しました。
            <p className="pw-auth__sent-hint">メールが届かない場合、迷惑メールフォルダもご確認ください。</p>
          </div>
        </div>
      )}

      <div className="pw-auth__alt">
        <button type="button" className="pw-auth__link" onClick={() => onView("login")}>
          ← ログインに戻る
        </button>
      </div>
    </form>
  );
}

Object.assign(window, { AuthShell, LoginForm, SignupForm, ForgotForm });
