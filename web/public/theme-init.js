(function () {
  var theme;
  try { theme = localStorage.getItem("hypestamp.theme"); } catch (_) {}
  if (theme !== "light" && theme !== "dark") {
    theme = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
