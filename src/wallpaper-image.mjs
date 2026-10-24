/** User-selected local wallpaper. Data URLs are deliberately bounded and image-only. */
export const MAX_WALLPAPER_BYTES=1024*1024;
const signature=bytes=>{
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
};
function dimensions(bytes,type){
  const be16=i=>(bytes[i]<<8)|bytes[i+1];
  const le16=i=>bytes[i]|(bytes[i+1]<<8);
  const be32=i=>((bytes[i]*0x1000000)+(bytes[i+1]<<16)+(bytes[i+2]<<8)+bytes[i+3])>>>0;
  if(type==='image/png'&&bytes.length>=24)return [be32(16),be32(20)];
  if(type==='image/jpeg'){
    for(let i=2;i+9<bytes.length;){
      if(bytes[i]!==255)return null;
      while(bytes[i]===255)i++;
      const marker=bytes[i++];if(marker===217||marker===218)return null;
      const length=be16(i);if(length<2||i+length>bytes.length)return null;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7)return [be16(i+5),be16(i+3)];
      i+=length;
    }
  }
  if(type==='image/webp'&&bytes.length>=30){
    const fourcc=String.fromCharCode(...bytes.slice(12,16));
    if(fourcc==='VP8X')return [1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)];
    if(fourcc==='VP8L'&&bytes[20]===47){const bits=bytes[21]+(bytes[22]<<8)+(bytes[23]<<16)+(bytes[24]*0x1000000);return [1+(bits&0x3fff),1+((bits>>>14)&0x3fff)];}
    if(fourcc==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return [le16(26)&0x3fff,le16(28)&0x3fff];
  }
  return null;
}
function validDimensions(bytes,type){
  const [width,height]=dimensions(bytes,type)||[];
  return Number.isInteger(width)&&Number.isInteger(height)&&width>=320&&height>=240&&width<=4096&&height<=4096&&width*height<=12000000;
}
export function validateWallpaperDataUrl(value){
  if(typeof value!=='string'||value.length>Math.ceil(MAX_WALLPAPER_BYTES*4/3)+64)throw Error('Wallpaper image is too large');
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)throw Error('Wallpaper must be a PNG, JPEG or WebP image');
  const decoded=atob(match[2]);
  if(decoded.length>MAX_WALLPAPER_BYTES||signature(Uint8Array.from(decoded,char=>char.charCodeAt(0)))!==match[1])throw Error('Wallpaper image is invalid');
  return value;
}
export const readWallpaperFile=async (file,{decodeImage=blob=>createImageBitmap(blob),readDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Unable to read wallpaper'));reader.readAsDataURL(blob);})}={})=>{
  if(!file||!Number.isInteger(file.size)||file.size<=0||file.size>MAX_WALLPAPER_BYTES)throw Error('Choose an image under 1 MB');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==file.size)throw Error('Wallpaper file changed during import');
  const type=signature(bytes);
  if(!type)throw Error('Choose a PNG, JPEG or WebP image');
  if(!validDimensions(bytes,type))throw Error('Wallpaper dimensions must be 320×240 to 4096×4096');
  const blob=new Blob([bytes],{type});
  let image;
  try{image=await decodeImage(blob);if(!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<320||image.height<240||image.width>4096||image.height>4096||image.width*image.height>12000000)throw Error('Wallpaper dimensions must be 320×240 to 4096×4096');}
  finally{image?.close?.();}
  return validateWallpaperDataUrl(await readDataUrl(blob));
};
