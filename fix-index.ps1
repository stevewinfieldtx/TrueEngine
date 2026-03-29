# fix-index.ps1 — Run from C:\Users\steve\Documents\TrueEngine
# Replaces the broken CDN loader with a single local script tag

$file = "src\public\index.html"
$content = Get-Content $file -Raw

# Remove the entire tryLoad CDN block and replace with local lib + direct init
$old = @'
<script>
(function(){
  // Load a script, trying multiple CDN sources with fallback
  function tryLoad(urls){
    var i=0;
    return new Promise(function(ok,no){
      function attempt(){
        if(i>=urls.length){no(new Error('All CDNs failed'));return}
        var s=document.createElement('script');
        s.src=urls[i];
        s.onload=ok;
        s.onerror=function(){console.warn('CDN failed: '+urls[i]);i++;attempt()};
        document.head.appendChild(s);
      }
      attempt();
    });
  }

  // Three.js: try unpkg first, then cdnjs, then jsdelivr
  tryLoad([
    'https://unpkg.com/three@0.168.0/build/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r168/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.min.js'
  ]).then(function(){
    // 3d-force-graph: try unpkg first, then jsdelivr
    return tryLoad([
      'https://unpkg.com/3d-force-graph@1.79.0/dist/3d-force-graph.min.js',
      'https://cdn.jsdelivr.net/npm/3d-force-graph@1.79.0/dist/3d-force-graph.min.js'
    ]);
  }).then(go).catch(function(e){
    document.getElementById('gc').innerHTML='<div style="color:#d4a853;text-align:center;padding-top:40vh;font-size:1.2rem">Could not load 3D engine. Please check your connection and refresh.</div>';
  });

  function go(){
'@

$new = @'
<!--
  Self-hosted from node_modules via postinstall (scripts/copy-vendor.js).
  This bundle includes Three.js and exposes both ForceGraph3D and window.THREE.
  No CDN dependency = no outages.
-->
<script src="/lib/3d-force-graph.min.js"></script>

<script>
(function(){
  // Verify libs loaded
  if (typeof ForceGraph3D === 'undefined' || typeof THREE === 'undefined') {
    document.getElementById('gc').innerHTML =
      '<div style="color:#d4a853;text-align:center;padding-top:40vh;font-size:1.2rem">' +
      'Could not load 3D engine. Library file missing.<br>' +
      '<span style="font-size:.8rem;opacity:.5">Expected /lib/3d-force-graph.min.js — run npm install</span></div>';
    return;
  }

'@

$content = $content.Replace($old, $new)

# Also fix the closing — remove the extra function wrapper close from go()
# The old code had "function go(){...}" inside the IIFE, now it's just inline in the IIFE
# No change needed there since we just replaced the opening

Set-Content $file $content -NoNewline
Write-Host "Done! CDN loader replaced with local /lib/3d-force-graph.min.js"
Write-Host "Now run: npm install"
