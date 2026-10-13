let photoScale=1,photoX=0,photoY=0;
const photoPointers=new Map();let photoGesture=null,photoTap=null,photoLastTap=null;
function paintPhotoView(){
 const image=$('#photo-viewer-image'),stage=$('#photo-viewer-stage');
 const limitX=Math.max(0,(image.clientWidth*photoScale-stage.clientWidth)/2),limitY=Math.max(0,(image.clientHeight*photoScale-stage.clientHeight)/2);
 photoX=Math.max(-limitX,Math.min(limitX,photoX));photoY=Math.max(-limitY,Math.min(limitY,photoY));
 image.style.transform=`translate(${photoX}px,${photoY}px) scale(${photoScale})`;
 $('#photo-zoom-reset').textContent=Math.round(photoScale*100)+'%';
 $('#photo-zoom-out').disabled=photoScale<=1;$('#photo-zoom-in').disabled=photoScale>=5;
}
function zoomPhotoView(value){photoScale=Math.max(1,Math.min(5,value));paintPhotoView();}
function resetPhotoView(){photoScale=1;photoX=photoY=0;photoPointers.clear();photoGesture=null;photoTap=photoLastTap=null;paintPhotoView();}
function startPhotoGesture(){
 const points=[...photoPointers.values()];
 photoGesture=points.length>1?{kind:'pinch',distance:Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y),cx:(points[0].x+points[1].x)/2,cy:(points[0].y+points[1].y)/2,scale:photoScale,x:photoX,y:photoY}:points.length?{kind:'pan',cx:points[0].x,cy:points[0].y,x:photoX,y:photoY}:null;
}
const photoStage=$('#photo-viewer-stage');
photoStage.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();photoStage.setPointerCapture(event.pointerId);photoPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});startPhotoGesture();photoTap=photoPointers.size===1?{x:event.clientX,y:event.clientY,time:Date.now(),touch:event.pointerType==='touch'}:null;});
photoStage.addEventListener('pointermove',event=>{
 if(!photoPointers.has(event.pointerId)||!photoGesture)return;event.preventDefault();photoPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const points=[...photoPointers.values()],g=photoGesture;
 if(g.kind==='pinch'&&points.length>1&&g.distance>0){photoScale=Math.max(1,Math.min(5,g.scale*Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y)/g.distance));photoX=g.x+(points[0].x+points[1].x)/2-g.cx;photoY=g.y+(points[0].y+points[1].y)/2-g.cy;}
 else if(g.kind==='pan'&&photoScale>1){photoX=g.x+points[0].x-g.cx;photoY=g.y+points[0].y-g.cy;}
 if(photoTap&&Math.hypot(event.clientX-photoTap.x,event.clientY-photoTap.y)>10)photoTap=null;
 paintPhotoView();
});
const endPhotoPointer=event=>{
 if(event.type==='pointerup'&&photoTap?.touch&&Date.now()-photoTap.time<300){const now=Date.now();if(photoLastTap&&now-photoLastTap.time<350&&Math.hypot(photoTap.x-photoLastTap.x,photoTap.y-photoLastTap.y)<30){zoomPhotoView(photoScale>1?1:2.5);photoLastTap=null;}else photoLastTap={...photoTap,time:now};}
 photoTap=null;photoPointers.delete(event.pointerId);startPhotoGesture();
};
for(const name of ['pointerup','pointercancel','lostpointercapture'])photoStage.addEventListener(name,endPhotoPointer);
photoStage.addEventListener('dblclick',event=>{event.preventDefault();zoomPhotoView(photoScale>1?1:2.5);});
photoStage.addEventListener('wheel',event=>{event.preventDefault();zoomPhotoView(photoScale*(event.deltaY<0?1.15:1/1.15));},{passive:false});
$('#photo-zoom-in').onclick=()=>zoomPhotoView(photoScale+.5);$('#photo-zoom-out').onclick=()=>zoomPhotoView(photoScale-.5);$('#photo-zoom-reset').onclick=resetPhotoView;
$('#photo-viewer-close').onclick=()=>$('#photo-viewer').close();
$('#photo-viewer-image').addEventListener('load',paintPhotoView);
$('#photo-viewer').addEventListener('close',resetPhotoView);
window.addEventListener('resize',()=>{if($('#photo-viewer').open)paintPhotoView();});
