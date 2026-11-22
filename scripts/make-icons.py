from PIL import Image, ImageDraw
import os
NAVY=(31,58,95); WHITE=(255,255,255); RED=(214,64,52); AMBER=(242,165,65)
def sign(size, pad):
    im=Image.new('RGBA',(size,size),(0,0,0,0)); d=ImageDraw.Draw(im)
    s=size; cx=s/2
    top=pad+s*0.02; bot=s-pad-s*0.06; half=(bot-top)/1.732*1.0
    tri=[(cx,top),(cx+half,bot),(cx-half,bot)]
    d.polygon(tri, fill=RED)
    inset=(bot-top)*0.17
    t2=[(cx,top+inset*1.15),(cx+half-inset*1.0,bot-inset*0.55),(cx-half+inset*1.0,bot-inset*0.55)]
    d.polygon(t2, fill=WHITE)
    # ברק קטן — "מהר וקצר"
    h=(bot-top)*0.42; w=h*0.55; y0=top+(bot-top)*0.42; x0=cx
    bolt=[(x0+w*0.15,y0),(x0-w*0.35,y0+h*0.55),(x0-w*0.02,y0+h*0.55),(x0-w*0.2,y0+h),(x0+w*0.38,y0+h*0.38),(x0+w*0.05,y0+h*0.38),(x0+w*0.25,y0)]
    d.polygon(bolt, fill=NAVY)
    return im
dens={'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}
res='android/app/src/main/res'
for k,px in dens.items():
    big=px*4
    bg=Image.new('RGBA',(big,big),(0,0,0,0)); d=ImageDraw.Draw(bg)
    d.rounded_rectangle([0,0,big-1,big-1], radius=big*0.22, fill=(246,244,239))
    bg.alpha_composite(sign(big, big*0.12))
    bg.resize((px,px),Image.LANCZOS).save(f'{res}/mipmap-{k}/ic_launcher.png')
    r=Image.new('RGBA',(big,big),(0,0,0,0)); m=Image.new('L',(big,big),0); ImageDraw.Draw(m).ellipse([0,0,big-1,big-1],fill=255)
    circ=Image.new('RGBA',(big,big),(246,244,239,255)); circ.alpha_composite(sign(big, big*0.17)); r.paste(circ,(0,0),m)
    r.resize((px,px),Image.LANCZOS).save(f'{res}/mipmap-{k}/ic_launcher_round.png')
    fg_px=int(px*108/48); fb=fg_px*4
    fg=sign(fb, fb*0.27)
    fg.resize((fg_px,fg_px),Image.LANCZOS).save(f'{res}/mipmap-{k}/ic_launcher_foreground.png')

print('ok')
