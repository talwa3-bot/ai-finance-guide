# תוכן AI Finance: רילס לאינסטגרם

20 נושאים, כל אחד בעברית ובאנגלית. סרטונים קצרים, 15 עד 27 שניות, אנכיים (1080 על 1920), עם כתוביות.

## ההגדרות

- מציגה: טל בלבד. לוקים מתחלפים: 3, 23, 4 (לפי מספר הסרטון).
- קול: tal v.
- מנוע: avatar_iii. מחיר שנמדד: כ־0.017 דולר לשנייה, כלומר 0.30 עד 0.52 דולר לסרטון.
- תקציב: עד 1.5 דולר לסרטון כולל בדיקות. הפקודה חוסמת מראש סרטון שעלול לחרוג.
- כל עלות נרשמת בקובץ `content/costs.csv`, לפי הנתונים של הייג׳ן עצמם.
- עריכה, התאמה לגודל וכתוביות נעשות מקומית בחינם, בלי הייג׳ן.

## הרצה

```bash
python -m remix --dry-run heygen batch          # מה ייוצר, הערכת עלות, ומה חסום
python -m remix heygen batch --lang he           # כל הסרטונים בעברית
python -m remix heygen batch --ids 05 06         # רק סרטונים מסוימים
```

התוצאה: `outputs/aifinance_<מספר>_<שפה>.mp4` מוכן להעלאה. הקובץ הגולמי מהייג׳ן נשמר לידו עם הסיומת `_raw`.
הרצה חוזרת מדלגת על מה שכבר מוכן, ולא מחייבת שוב סרטון שכבר ירד.

## הרשימה

| # | נושא | לוק | מקור |
|---|---|---|---|
| 01 | Train your finance team on AI in 30 days | 3 | [Nicolas Boucher](https://www.youtube.com/watch?v=Qc99kkGVc_E) |
| 02 | 5 AI use cases that pay off fastest in finance | 23 | [Christian Martinez](https://www.youtube.com/watch?v=YKp-dakYdUM) |
| 03 | 3 analysis methods every finance pro uses | 4 | [Josh Aharonoff (Your CFO Guy)](https://www.youtube.com/watch?v=E4NSAQ-Z7II) |
| 04 | The 5 AI habits that matter more than 100 tips | 3 | [Nicolas Boucher](https://www.youtube.com/watch?v=fXpujvooDt4) |
| 05 | Cohort analysis in Excel in plain words | 23 | [Kenji Explains](https://www.youtube.com/watch?v=GOLv8xbd6t0) |
| 06 | 7 financial models and when to use each | 4 | [Bojan Radojicic](https://www.youtube.com/watch?v=gfN7FDNvZIM) |
| 07 | Variance analysis that explains the why | 3 | [Soufyan Hamid](https://www.youtube.com/watch?v=ZvAodD7SCmA) |
| 08 | Build a finance app without writing code | 23 | [Christian Martinez](https://www.youtube.com/watch?v=mplYk-IfQvo) |
| 09 | ChatGPT moves most finance teams skip | 4 | [Nicolas Boucher](https://www.youtube.com/watch?v=TICcBq5thWM) |
| 10 | A forecasting model your CFO will trust | 3 | [Bojan Radojicic](https://www.youtube.com/watch?v=roKJFHzOl4o) |
| 11 | 4 ways finance teams should use Claude | 23 | [Nicolas Boucher](https://www.youtube.com/watch?v=5YEaZMaEMFQ) |
| 12 | Copilot inside the Microsoft tools you already use | 4 | [Nicolas Boucher](https://www.youtube.com/watch?v=PYn-qfGDlr0) |
| 13 | Building a financial model with AI the safe way | 3 | [Nicolas Boucher](https://www.youtube.com/watch?v=W-tMaaX777I) |
| 14 | Copilot in Excel: 5 finance tasks | 23 | [(verify channel)](https://www.youtube.com/watch?v=s5xIJgJcpTk) |
| 15 | Where vibe coding actually helps finance | 4 | [(verify channel)](https://www.youtube.com/watch?v=6bLmXAUWL2k) |
| 16 | How to start learning AI as a finance pro | 3 | [(verify channel)](https://www.youtube.com/watch?v=StmIlQ37nMg) |
| 17 | 5 dashboards every CFO should have | 23 | [Josh Aharonoff (Your CFO Guy)](https://www.youtube.com/watch?v=9GFSw7xcsvw) |
| 18 | The 5 slides for a monthly CFO review | 4 | [Soufyan Hamid](https://www.youtube.com/watch?v=g9OA6UzbkX4) |
| 19 | Which variances to ignore | 3 | [Soufyan Hamid](https://www.youtube.com/watch?v=rGEGYzo-jfk) |
| 20 | AI skills: turn your best process into a reusable tool | 23 | [Moonshine Capital TV](https://www.youtube.com/watch?v=hXYtY6BYgQk) |

התסריטים הקצרים: `content/scripts/`. הגרסאות הארוכות (דקה) שמורות ב־`content/scripts_long/`.
התסריטים מקוריים, על בסיס הנושא של סרטון המקור. הקישור למקור לעיון בלבד.
