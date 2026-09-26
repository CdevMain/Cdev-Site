(function () {
  const $ = (selector, root = document) => root.querySelector(selector);

  const setMessage = (message, tone = 'neutral') => {
    const el = $('#login-feedback');
    el.textContent = message;
    el.dataset.tone = tone;
  };

  const nextPage = () => {
    const params = new URLSearchParams(location.search);
    const next = params.get('next') || '';
    // so aceita caminhos internos (evita redirecionar para outro site)
    if (/^\/(?![\/\\])[^\s\\]*$/.test(next)) return next;
    if (/^[\w-]+(\.html)?([?#].*)?$/.test(next)) return `/${next.replace(/\.html/, '')}`;
    return '/dashboard';
  };

  const init = () => {
    const form = $('#login-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const supabase = window.CDEVAuth.getClient();
        const formData = new FormData(form);
        const email = String(formData.get('email') || '').trim();
        const password = String(formData.get('password') || '');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage('Login realizado. Redirecionando...', 'success');
        window.location.replace(nextPage());
      } catch (error) {
        setMessage(error.message || 'Nao foi possivel entrar.', 'error');
      }
    });

    document.body.classList.add('auth-ready');
  };

  document.addEventListener('DOMContentLoaded', init);
})();
