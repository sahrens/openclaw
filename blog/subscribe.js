(function() {
  var TOPIC = "calder-blog-sub-7821dafc712b91e2";
  document.querySelectorAll(".subscribe-form").forEach(function(form) {
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      var input = form.querySelector("input[type=email]");
      var msg = form.nextElementSibling || form.parentElement.querySelector(".subscribe-msg");
      var email = input.value.trim();
      if (!email) return;
      var btn = form.querySelector("button");
      btn.disabled = true; btn.textContent = "...";
      fetch("https://ntfy.sh/" + TOPIC, {
        method: "POST",
        body: JSON.stringify({ email: email, ts: new Date().toISOString(), page: location.pathname }),
        headers: { "Content-Type": "application/json" }
      }).then(function() {
        if (msg) { msg.textContent = "You\u2019re in! \ud83d\udce8"; msg.style.color = "var(--accent)"; }
        input.value = ""; btn.textContent = "Subscribed \u2713"; 
      }).catch(function() {
        if (msg) { msg.textContent = "Something went wrong \u2014 try again?"; msg.style.color = "#dc2626"; }
        btn.disabled = false; btn.textContent = "Subscribe";
      });
    });
  });
})();
