# Video Remix Studio

פרויקט אחד שמאחד שלושה מנועי וידאו פתוחים תחת ממשק פקודה אחד וממשק גרפי אחד:

| מנוע | מה הוא עושה | מקור |
|---|---|---|
| ויאס | עריכת סרטון קיים: החלפת דמויות, סגנון, אזורים מסומנים | `ali-vilab/VACE` |
| וואן 2.1 | מודל הבסיס: יצירה מטקסט ומתמונה, ומשימות ויאס עם מסכות משלך | `Wan-Video/Wan2.1` |
| וואן ג׳יפי | סטודיו מלא עם כלי הכנה ומודלים נוספים, עובד גם על כרטיסים חלשים | `deepbeepmeep/WanGP` |

## למה כל מנוע בסביבה נפרדת

לשלושת המנועים יש תלויות שמתנגשות זו בזו (גרסאות פייתון ופייטורץ׳ שונות).
לכן הפרויקט לא מערבב אותם, אלא מתקין כל אחד בסביבה משלו ומפעיל אותו מבחוץ.
מבחינתך זה פרויקט אחד: פקודה אחת, תיקיית מודלים אחת, תיקיית תוצאות אחת.

```
video-remix-studio/
├── remix/          קוד המתאם (פקודות + ממשק)
├── engines/        שלושת הריפו וסביבה לכל אחד (נוצר בהתקנה)
├── models/         משקולות המודלים, משותפות (נוצר בהורדה)
└── outputs/        כל הסרטונים שנוצרו
```

## דרישות

1. כרטיס מסך של אנבידיה. למודל הקטן צריך בערך 8 עד 12 ג׳יגה זיכרון גרפי, לגדול הרבה יותר.
2. גיט, ופייתון 3.10 ומעלה.
3. מומלץ: ffmpeg.

## התקנה (פעם אחת)

```bash
pip install -r requirements.txt
python -m remix setup            # מוריד ומתקין את שלושת המנועים
python -m remix download         # מוריד את מודל ויאס הקטן ואת כלי ההכנה
python -m remix doctor           # בדיקה שהכל מוכן
```

אפשר להתקין רק חלק:

```bash
python -m remix setup vace wangp
python -m remix download Wan2.1-VACE-14B
```

## שימוש

### ממשק גרפי אחד לכולם

```bash
python -m remix ui
```

ואז לפתוח בדפדפן: http://localhost:7870
יש שלוש לשוניות: עריכת סרטון קיים, יצירה ושליטה מתקדמת, וסטודיו מלא.

### מהשורה

עריכת סרטון קיים, שומרים על התנועה ומחליפים את המראה:

```bash
python -m remix edit --task depth --video input.mp4 \
  --prompt "a robot dancing in a neon city at night"
```

החלפת אזור מסומן במלבן:

```bash
python -m remix edit --task inpainting --mode bbox --bbox 50,50,550,700 \
  --video input.mp4 --prompt "a red sports car"
```

החלפת דמות בסרטון לפי תמונת ייחוס:

```bash
python -m remix edit --task swap_anything --mode salient --video input.mp4 \
  --image new_character.png --prompt "the person from the reference image dancing"
```

הרצה ישירה של וואן 2.1 עם מסכה ותמונות ייחוס משלך:

```bash
python -m remix generate --task vace-1.3B --video src.mp4 --mask mask.mp4 \
  --ref face.png --prompt "the same scene, the woman now wears a blue coat"
```

פתיחת הסטודיו המלא, או עיבוד תור שמור בלי ממשק:

```bash
python -m remix wangp
python -m remix wangp --process my_queue.zip
```

כל פרמטר נוסף אחרי `--` עובר כמו שהוא למנוע עצמו:

```bash
python -m remix edit --task pose --video in.mp4 --prompt "..." -- --sample_steps 30
```

לראות את הפקודות בלי להריץ:

```bash
python -m remix --dry-run edit --task depth --video in.mp4 --prompt "test"
```

## להפוך סרטון לשלך עם הייג׳ן

לוקחים סרטון קיים, מחלצים ממנו את הטקסט, כותבים אותו מחדש במילים שלך,
והאווטאר שלך בהייג׳ן מציג אותו בקול שלך.

### הכנה (פעם אחת)

```bash
pip install faster-whisper          # תמלול מקומי, עובד גם בלי כרטיס מסך
export HEYGEN_API_KEY=המפתח-שלך       # מהייג׳ן: הגדרות, ממשק תכנות
python -m remix heygen avatars      # רשימת האווטארים שלך, מעתיקים את המזהה
python -m remix heygen voices       # רשימת הקולות המשובטים שלך
```

### לכל סרטון

```bash
python -m remix heygen transcribe source.mp4            # יוצר outputs/source.transcript.txt
# כותבים את התסריט החדש בקובץ, למשל source.script.txt
python -m remix heygen render source.script.txt --avatar <מזהה> --aspect 9:16
```

התוצאה יורדת לתיקייה `outputs/`. ברירת המחדל היא סרטון אנכי לרשתות (9:16).
לבדיקה בלי לשלוח כלום להייג׳ן: `python -m remix --dry-run heygen render source.script.txt`

חשוב: כותבים את הרעיון מחדש במילים שלך. לא מעתיקים מילה במילה תוכן של יוצר אחר.

### הרבה סרטונים בבת אחת

הקטלוג, התסריטים וההגדרות של המציגים נמצאים בתיקייה `content/`. ההסבר המלא ב־`content/README.md`.

```bash
python -m remix --dry-run heygen batch     # מה ירוץ ומה חסום
python -m remix heygen batch --lang he     # כל הסרטונים בעברית
```

## הרצה על שרת גרפי בענן (מודל)

אין כרטיס מסך חזק? אפשר להריץ הכול על שרת בענן של מודל (Modal), ולעבוד גם מהטלפון.
משלמים רק על זמן ריצה, והשרת נכבה לבד כשלא משתמשים בו.

### הקמה (פעם אחת, מהמחשב)

1. פותחים חשבון באתר modal.com ומתחברים:

```bash
pip install modal
modal setup
```

2. בוחרים סיסמה לממשק, כדי שאף אחד אחר לא יוכל להיכנס:

```bash
modal secret create remix-ui REMIX_UI_PASSWORD=הסיסמה-שלך
```

3. מקימים את השרת ומורידים את המודלים לענן:

```bash
python -m remix cloud deploy     # בנייה ראשונה לוקחת זמן רב, אחר כך מהיר
python -m remix cloud models     # מוריד את המודל הקטן ואת כלי ההכנה לאחסון בענן
python -m remix cloud url        # מדפיס את כתובת הממשק
```

### מהטלפון

1. פותחים בדפדפן את הכתובת שקיבלתם מ־`cloud url`.
2. נכנסים עם שם המשתמש `remix` והסיסמה שבחרתם.
3. מעלים סרטון, בוחרים סוג עיבוד, ולוחצים "הרצה". התוצאה מופיעה בעמוד ואפשר להוריד אותה.

הפעלה ראשונה אחרי הפסקה לוקחת כמה דקות, עד שהשרת עולה.
אחרי 5 דקות בלי שימוש השרת נכבה, והחיוב נעצר.

### מהמחשב, בלי כרטיס מסך

מוסיפים `--cloud` לפני הפקודה. הקבצים עולים לענן, והתוצאה יורדת לתיקייה `outputs/`:

```bash
python -m remix --cloud edit --task depth --video input.mp4 --prompt "a robot dancing"
python -m remix --cloud --gpu H100 generate --task vace-14B --video src.mp4 --prompt "..."
```

כרטיס ברירת המחדל: L40S למודל הקטן, A100 עם 80 ג׳יגה למודל הגדול. `--gpu` מחליף אותו.
לבדיקה בלי לשלוח כלום: `python -m remix --dry-run --cloud edit ...`

### מגבלות בענן

- בענן מותקנים ויאס ווואן 2.1. וואן ג׳יפי דורש גרסת דרייבר חדשה מאוד, ולכן הוא לא נכלל כברירת מחדל.
  להוספה: `REMIX_CLOUD_ENGINES=vace,wan21,wangp python -m remix cloud deploy`
- הממשק בענן רץ על L40S. כדי להשתמש בו במודל הגדול: `REMIX_CLOUD_UI_GPU=A100-80GB python -m remix cloud deploy`
- התוצאות נשמרות גם באחסון בענן בשם `remix-outputs`.

## סוגי עיבוד עיקריים בויאס

| משימה | מה קורה |
|---|---|
| depth | שומר על מבנה הסצנה והתנועה, מחליף מראה וסגנון |
| pose | שומר על תנועת האנשים, מחליף את הדמויות |
| gray | צביעה מחדש של סרטון |
| inpainting | מחליף אזור מסומן (מלבן או מסכה) |
| outpainting | מרחיב את הפריים לצדדים |
| frameref | משלים סרטון בין פריימים נתונים |

הרשימה המלאה נמצאת בתיקייה `engines/VACE/vace/configs`.

## רישוי ושימוש

- מודלי ויאס על בסיס וואן 2.1 ברישיון אפאצ׳י 2.0, כולל שימוש מסחרי.
- לכל מנוע יש רישיון משלו בתיקייה שלו. לבדוק לפני שימוש מסחרי.
- אחריות על התוכן: לא להשתמש בפנים או בקול של אדם אמיתי בלי הסכמתו.

## מגבלות ידועות

- ההתקנה כבדה (עשרות ג׳יגה של משקולות). המודל הגדול דורש כרטיס חזק או שרת ענן.
- המנועים מתעדכנים מהר. אם פרמטר השתנה אצלם, מעבירים אותו ידנית אחרי `--`.
- `python -m remix setup --update` מושך את הגרסה האחרונה של כל ריפו.
