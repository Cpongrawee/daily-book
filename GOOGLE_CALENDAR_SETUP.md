# เชื่อม Daily Book กับ Google Calendar

หน้า Calendar ใช้ได้ทันทีโดยไม่ต้องเชื่อม Google การเชื่อมครั้งแรกต้องใช้บัญชีของคุณและ OAuth Desktop app ของ Google

## ตั้งค่าครั้งแรก

1. เปิด [Google Cloud Console](https://console.cloud.google.com/) แล้วสร้างหรือเลือก project ส่วนตัว
2. เปิดใช้งาน **Google Calendar API** ใน API Library
3. ตั้งค่า **Google Auth Platform / OAuth consent screen** ใส่ชื่อแอป Daily Book และอีเมลของคุณ หากใช้ External + Testing ให้เพิ่มบัญชี Google ของคุณใน Test users
4. ใน Clients สร้าง OAuth client ชนิด **Desktop app** แล้วดาวน์โหลด JSON อย่าเลือก Web application
5. เปิด Daily Book → **04 Calendar** → **Google Calendar** เลือกไฟล์ OAuth Desktop JSON แล้วกด **Sign in with Google** ลงชื่อเข้าใช้และอนุญาตสิทธิ์ในหน้า Google (แอปเก็บสำเนาที่เข้ารหัสไว้แล้ว ส่วนไฟล์ JSON ต้นฉบับให้ย้ายไปเก็บที่ `data\google-private\` อย่าวางไว้ในโฟลเดอร์ทั่วไป)
6. กลับ Daily Book กด **Choose calendar** แล้วเลือกปฏิทินเดิมที่คุณต้องการซิงก์ ต้องมีสิทธิ์ writer หรือ owner
7. กด **Test connection** แอปจะสร้าง อ่าน และลบนัดหมายทดสอบชั่วคราวในปฏิทินนั้น เมื่อผ่านแล้วกด **Start / resume sync** เพื่อส่งกิจกรรมเดิมทั้งหมดรวมอดีต และดึงนัดหมาย Google กลับมา

สิทธิ์ที่ขอคือ `calendar.events` และ `calendar.calendarlist.readonly` ใช้สำหรับอ่าน/แก้นัดหมายและแสดงรายชื่อปฏิทิน แอปไม่ส่ง reflections, priorities, tasks, ประวัติการเปลี่ยนแผน หรือสถานะทำเสร็จไป Google

## ใช้งาน

- Month แสดงภาพรวม; Week แสดงเวลา 00:00–24:00 คลิกวันที่หรือช่วงเวลาเพื่อเพิ่มกิจกรรม
- กิจกรรมทั้งวันใช้วันสิ้นสุดแบบรวมวันนั้นในแบบฟอร์ม; ภายในและ Google เก็บวันสิ้นสุดแบบไม่รวมวันนั้น
- กิจกรรมข้ามคืนปรากฏใน Daily ทั้งสองวัน แก้รายละเอียดผ่าน Calendar โดยไม่แยกเป็นกิจกรรมคนละรายการ
- กิจกรรมซ้ำรองรับรายวัน/สัปดาห์ แก้หรือลบเฉพาะครั้งหรือทั้งชุดได้ กฎซ้ำซับซ้อน นัดหมายมีผู้เข้าร่วม และรายการที่แก้ไม่ได้ ให้เปิดจัดการใน Google
- กิจกรรมเดิมที่ไม่ระบุเวลาสิ้นสุดใช้ 30 นาทีใน Google และเก็บความหมายเดิมไว้ใน Daily Book
- ซิงก์เมื่อเริ่มเซิร์ฟเวอร์ หลังบันทึก ทุก 60 วินาที หรือกด Sync now คอมพิวเตอร์ต้องเปิดและเซิร์ฟเวอร์ Daily Book ต้องทำงาน
- ไม่มีอินเทอร์เน็ตยังบันทึกในเครื่องได้ คิวที่รอส่งคำนวณจากข้อมูลที่บันทึกกับสถานะการซิงก์บนดิสก์ จึงทำต่อหลังรีสตาร์ตได้
- หากทั้งสองฝั่งเปลี่ยนรายการเดียวกัน จะมีตัวเลือก Keep Daily Book / Keep Google แทนการทับข้อมูลอัตโนมัติ
- ปุ่ม Disconnect หยุดการเข้าถึง Google แต่เก็บนัดหมายและรหัสเชื่อมโยงไว้ เพื่อให้เชื่อมปฏิทินเดิมกลับมาแล้วไม่ส่งซ้ำ รุ่นนี้เลือกหนึ่งปฏิทินต่อการติดตั้ง
- Restore backup หยุดซิงก์ก่อน และเก็บรายการที่ถูกนำออกเป็น tombstone ภายใน ตรวจข้อมูลก่อนกด Start / resume sync

## ข้อมูลและความปลอดภัย

การย้ายข้อมูลตารางเดิมจะสำรอง `book.json` ก่อน เพิ่ม `calendar.version: 1` และ `calendar.events` โดย `days[].schedule` เป็นข้อมูลที่สร้างจากกิจกรรมส่วนกลาง ข้อมูลรายวันอื่นยังอยู่ตามเดิม รองรับ Restore backup รุ่นเก่า

OAuth credentials และ refresh token เข้ารหัสด้วย Windows DPAPI ของบัญชี Windows ปัจจุบันใน `data/google-private/credentials.dpapi` ไม่ส่งให้หน้าเว็บและไม่อยู่ใน Download backup สถานะ sync และ mapping อยู่ใน `data/google-private/sync.json` อย่าลบไฟล์ mapping เพื่อแก้ปัญหา เพราะอาจทำให้เกิดรายการซ้ำหลังเชื่อมใหม่

OAuth แบบ External ที่ยังอยู่สถานะ Testing อาจให้ refresh token อายุ 7 วัน เมื่อหมดอายุให้กด Reconnect Google หรือพิจารณาการตั้งค่า Publishing status ตามข้อกำหนด Google: [OAuth documentation](https://developers.google.com/identity/protocols/oauth2#expiration)

## ตรวจสอบระบบ

```powershell
node --test tests/calendar.test.cjs tests/schedule-layout.test.cjs tests/behavior.test.cjs tests/mood-sleep.test.cjs
node tests/calendar-qa.cjs
node --test tests/server.test.cjs
```

การทดสอบใช้ข้อมูลชั่วคราว โดย browser QA ตรวจ hash/เนื้อหาของสมุดจริงว่าไม่เปลี่ยน การผ่าน API จำลองไม่เท่ากับผ่านบัญชี Google จริง ให้ดูผล Test connection และ Last sync ภายในแอปหลังลงชื่อเข้าใช้

รายละเอียดวิธีซิงก์: [Incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync), [ETag concurrency](https://developers.google.com/workspace/calendar/api/guides/version-resources), [Recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents)
