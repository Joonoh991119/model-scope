import sys
from PIL import Image, ImageDraw, ImageFont
shots, out = sys.argv[1], sys.argv[2]
TILES = [("ddm-sim","Decision","drift-diffusion"),("lif-raster","Neuron","LIF spikes"),("vision-transform","Vision","oriented filters"),
         ("attractor-landscape","Network","attractor"),("sir-spread","Population","SIR wave"),("compare","Compare","two models")]
CROP=(342,108,1328,803)
TW=640; th=int((CROP[3]-CROP[1])*TW/(CROP[2]-CROP[0])); LH=64; G=24; COLS=3
W=COLS*TW+(COLS+1)*G; H=2*(th+LH)+3*G
bg=(246,246,243); ink=(29,29,31); sub=(110,110,115); accent=(52,103,141)
im=Image.new("RGB",(W,H),bg); d=ImageDraw.Draw(im)
bold=ImageFont.truetype("/System/Library/Fonts/SFNS.ttf",36); bold.set_variation_by_name("Bold") if hasattr(bold,"set_variation_by_name") else None
reg=ImageFont.truetype("/System/Library/Fonts/SFNS.ttf",30)
for i,(f,k,s) in enumerate(TILES):
    r,c=divmod(i,COLS); x=G+c*(TW+G); y=G+r*(th+LH+G)
    t=Image.open(f"{shots}/{f}.png").convert("RGB").crop(CROP).resize((TW,th),Image.LANCZOS)
    d.rounded_rectangle((x-2,y-2,x+TW+2,y+LH+th+2),radius=14,fill=(255,255,255),outline=(214,214,210),width=2)
    d.text((x+20,y+LH/2),k,font=bold,fill=accent,anchor="lm")
    kw=d.textlength(k,font=bold)
    d.text((x+20+kw+14,y+LH/2),s,font=reg,fill=sub,anchor="lm")
    im.paste(t,(x,y+LH))
im.save(out,optimize=True)
print(im.size)
