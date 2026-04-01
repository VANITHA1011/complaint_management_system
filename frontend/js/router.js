// CIVIX SPA Router
// Reads localStorage('civix_page') and loads the right dashboard at /

(function () {
    const page = localStorage.getItem('civix_page');
    if (!page) return; // no page stored, stay on home/index

    // Clear so refresh goes back to home
    localStorage.removeItem('civix_page');

    // Fetch the dashboard HTML and replace the entire document
    fetch('/' + page + '.html')
        .then(r => r.text())
        .then(html => {
            document.open();
            document.write(html);
            document.close();
            // Keep URL clean as /
            history.replaceState(null, '', '/');
        })
        .catch(() => console.error('Router: failed to load page', page));
})();
