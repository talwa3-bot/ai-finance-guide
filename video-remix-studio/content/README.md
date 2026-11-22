# תוכן AI Finance: 20 סרטונים

כל סרטון כאן הוא תסריט מקורי, בערך דקה, בעברית ובאנגלית.
התסריטים נכתבו על בסיס הנושא של הסרטון המקורי, לא העתקה שלו. הקישור למקור מופיע לצורך עיון בלבד.

## איך מריצים (אחרי חיבור הייג׳ן)

1. ממלאים את `content/presenters.json`: מזהה אווטאר ומזהה קול לכל מציג ולכל שפה.
   את המזהים מקבלים מ־`python -m remix heygen avatars` ומ־`python -m remix heygen voices`.
2. בדיקה בלי שליחה: `python -m remix --dry-run heygen batch`
3. הרצה: `python -m remix heygen batch` (או רק חלק: `--ids 01 02 --lang he`)
4. התוצאות נשמרות ב־`outputs/aifinance_<מספר>_<שפה>.mp4`. הרצה חוזרת מדלגת על מה שכבר מוכן.

סרטונים של רועי חסומים עד שמסמנים `"consent_confirmed": true` אצלו בקובץ, אחרי שהוא אישר שימוש באווטאר ובקול שלו.

## הרשימה

| # | נושא | מציג | מקור |
|---|---|---|---|
| 01 | Train your finance team on AI in 30 days | טל | [Nicolas Boucher](https://www.youtube.com/watch?v=Qc99kkGVc_E) |
| 02 | 5 AI use cases that pay off fastest in finance | טל | [Christian Martinez](https://www.youtube.com/watch?v=YKp-dakYdUM) |
| 03 | 3 analysis methods every finance pro uses | רועי | [Josh Aharonoff (Your CFO Guy)](https://www.youtube.com/watch?v=E4NSAQ-Z7II) |
| 04 | The 5 AI habits that matter more than 100 tips | טל | [Nicolas Boucher](https://www.youtube.com/watch?v=fXpujvooDt4) |
| 05 | Cohort analysis in Excel in plain words | רועי | [Kenji Explains](https://www.youtube.com/watch?v=GOLv8xbd6t0) |
| 06 | 7 financial models and when to use each | רועי | [Bojan Radojicic](https://www.youtube.com/watch?v=gfN7FDNvZIM) |
| 07 | Variance analysis that explains the why | טל | [Soufyan Hamid](https://www.youtube.com/watch?v=ZvAodD7SCmA) |
| 08 | Build a finance app without writing code | רועי | [Christian Martinez](https://www.youtube.com/watch?v=mplYk-IfQvo) |
| 09 | ChatGPT moves most finance teams skip | טל | [Nicolas Boucher](https://www.youtube.com/watch?v=TICcBq5thWM) |
| 10 | A forecasting model your CFO will trust | רועי | [Bojan Radojicic](https://www.youtube.com/watch?v=roKJFHzOl4o) |
| 11 | 4 ways finance teams should use Claude | טל | [Nicolas Boucher](https://www.youtube.com/watch?v=5YEaZMaEMFQ) |
| 12 | Copilot inside the Microsoft tools you already use | טל | [Nicolas Boucher](https://www.youtube.com/watch?v=PYn-qfGDlr0) |
| 13 | Building a financial model with AI the safe way | רועי | [Nicolas Boucher](https://www.youtube.com/watch?v=W-tMaaX777I) |
| 14 | Copilot in Excel: 5 finance tasks | רועי | [(verify channel)](https://www.youtube.com/watch?v=s5xIJgJcpTk) |
| 15 | Where vibe coding actually helps finance | טל | [(verify channel)](https://www.youtube.com/watch?v=6bLmXAUWL2k) |
| 16 | How to start learning AI as a finance pro | טל | [(verify channel)](https://www.youtube.com/watch?v=StmIlQ37nMg) |
| 17 | 5 dashboards every CFO should have | רועי | [Josh Aharonoff (Your CFO Guy)](https://www.youtube.com/watch?v=9GFSw7xcsvw) |
| 18 | The 5 slides for a monthly CFO review | טל | [Soufyan Hamid](https://www.youtube.com/watch?v=g9OA6UzbkX4) |
| 19 | Which variances to ignore | טל | [Soufyan Hamid](https://www.youtube.com/watch?v=rGEGYzo-jfk) |
| 20 | AI skills: turn your best process into a reusable tool | טל | [Moonshine Capital TV](https://www.youtube.com/watch?v=hXYtY6BYgQk) |

התסריטים עצמם: `content/scripts/<מספר>.he.txt` ו־`content/scripts/<מספר>.en.txt`.
שורות שמתחילות ב־`#` הן הערות ולא נקראות בקול.
