// Capture legacy photo links as well as current thumbnails before navigation.
document.addEventListener('click',event=>{
 const target=event.target;
 if(!(target instanceof Element)||target.closest('#photo-viewer'))return;
 const image=target.closest('img')||target.closest('.photo-zoom,a')?.querySelector('img');
 if(!image)return;
 const url=new URL(image.src,location.href);
 if(url.origin!==location.origin||!/^\/api\/photos\/[a-f0-9]{36}$/.test(url.pathname))return;
 event.preventDefault();event.stopImmediatePropagation();
 const viewer=document.querySelector('#photo-viewer'),large=document.querySelector('#photo-viewer-image');
 large.src=image.dataset?.original||image.src;large.alt=image.alt;
 if(!viewer.open)viewer.showModal();
},true);
