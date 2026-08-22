-- business_settings previously defaulted every new business to USD/$, so a
-- fresh signup always started in dollars until someone manually changed it in
-- Settings → Currency. This project's actual usage is India-based, so the
-- sensible starting default is INR — still just a suggested default, fully
-- editable per business, not a hardcoded currency (docs/01 genericness
-- charter is about what the app can represent, not what it defaults to).

alter table public.business_settings alter column currency_code   set default 'INR';
alter table public.business_settings alter column currency_name   set default 'Indian Rupee';
alter table public.business_settings alter column currency_symbol set default 'Rs.';
