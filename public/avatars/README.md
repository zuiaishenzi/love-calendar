# 系统情侣头像

## 2026-10-01 重绘提示词（内置 image_gen）

### pair-2.png

Create an original high-quality romantic anime couple avatar diptych for a calendar app. Exactly two square panels side by side on a 2:1 horizontal canvas, exact equal halves, no gap or margins. LEFT portrait: one adult MAN, clearly masculine face, short hair. RIGHT portrait: one adult WOMAN, clearly feminine facial design, delicate rounded cheeks and chin, large expressive feminine eyes with long eyelashes, softly arched brows, long flowing hair visibly draped over both shoulders, subtle rosy lips, graceful feminine clothing and hair accessories. Both characters visibly adults in their mid twenties. Head and shoulders portraits, face centered within EACH square, enough room around head for circular cropping, gently looking toward each other. Delicate polished Japanese romance anime illustration, soft luminous pastel color, warm tender smile. Theme: 晴海：夏日海边，浅蓝海水与白云，左边银灰短发的成年男性，右边黑色波浪长发至胸口的成年女性，女性戴白色贝壳发夹、细耳饰、白色吊带连衣裙. Crucial: the RIGHT woman must not look boyish, must not have short hair or a masculine jaw. Pair should have visually distinct male and female designs. No text, watermark, logo, borders, extra people.

### pair-4.png

Create an original high-quality romantic anime couple avatar diptych for a calendar app. Exactly two square panels side by side on a 2:1 horizontal canvas, exact equal halves, no gap or margins. LEFT portrait: one adult MAN, clearly masculine face, short hair. RIGHT portrait: one adult WOMAN, clearly feminine facial design, delicate rounded cheeks and chin, large expressive feminine eyes with long eyelashes, softly arched brows, long flowing hair visibly draped over both shoulders, subtle rosy lips, graceful feminine clothing and hair accessories. Both characters visibly adults in their mid twenties. Head and shoulders portraits, face centered within EACH square, enough room around head for circular cropping, gently looking toward each other. Delicate polished Japanese romance anime illustration, soft luminous pastel color, warm tender smile. Theme: 冬暖：雪景，奶白与雾蓝，左边黑色短发的成年男性穿深色大衣与奶白围巾，右边栗棕色长卷发至胸口的成年女性，侧边蝴蝶结发饰，雾蓝围巾与奶油色大衣. Crucial: the RIGHT woman must not look boyish, must not have short hair or a masculine jaw. Pair should have visually distinct male and female designs. No text, watermark, logo, borders, extra people.

### pair-5.png

Create an original high-quality romantic anime couple avatar diptych for a calendar app. Exactly two square panels side by side on a 2:1 horizontal canvas, exact equal halves, no gap or margins. LEFT portrait: one adult MAN, clearly masculine face, short hair. RIGHT portrait: one adult WOMAN, clearly feminine facial design, delicate rounded cheeks and chin, large expressive feminine eyes with long eyelashes, softly arched brows, long flowing hair visibly draped over both shoulders, subtle rosy lips, graceful feminine clothing and hair accessories. Both characters visibly adults in their mid twenties. Head and shoulders portraits, face centered within EACH square, enough room around head for circular cropping, gently looking toward each other. Delicate polished Japanese romance anime illustration, soft luminous pastel color, warm tender smile. Theme: 星月：月光与星星，淡紫与柔金，左边浅棕短发的成年男性，右边深蓝黑色长波浪发的成年女性，银色月亮发夹、星星耳坠、淡紫色圆领裙装. Crucial: the RIGHT woman must not look boyish, must not have short hair or a masculine jaw. Pair should have visually distinct male and female designs. No text, watermark, logo, borders, extra people.

使用内置 image_gen 工具生成。源图左右各一个头像，通过 CSS 分别展示；服务端提供 512×256 WebP 预览，原始 PNG 保留在此目录。

- pair-1.png：樱花与春风，浅粉和奶油色，短黑发青年与长棕发青年
- pair-2.png：海边夏日，浅蓝与白色，银灰短发青年与黑色波浪长发青年
- pair-3.png：秋日书店，暖棕和琥珀色，棕色卷短发戴眼镜青年与黑色齐肩发青年
- pair-4.png：冬日围巾，奶白和雾蓝，黑色短发男生与栗棕长卷发、蝴蝶结发饰女生
- pair-5.png：月下星光，淡紫与柔金，浅棕短发青年与深蓝长发青年

## 生成提示词

初版使用以下共同提示词，将 `{theme}` 替换为对应列表中的完整主题；晴海、冬暖、星月已于 2026-10-01 使用下方提示词重新生成：

Use case: illustration-story. Create one paired anime profile avatar asset for a private romantic calendar. Two equally sized SQUARE portrait panels side by side in one 2:1 horizontal canvas, exact 50/50 split, no margins or gap. Each half contains exactly one adult character's head and shoulders fully within that half, centered face suitable for circular avatar clipping. Original gentle Japanese anime illustration, clean delicate linework, soft light, tender understated romance, polished small-icon readability. Theme: {theme}. Matching couple, subtly facing toward one another, warm smiles. No text, no logos, no watermarks, no borders. The two square halves will be displayed separately by CSS without altering the source image.
