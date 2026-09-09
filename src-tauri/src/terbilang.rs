/// Konversi angka ke terbilang dalam Bahasa Indonesia
/// Contoh: 1_500_000 -> "satu juta lima ratus ribu"
pub fn terbilang(n: f64) -> String {
    if n == 0.0 {
        return "nol rupiah".to_string();
    }

    let abs = n.abs() as u64;
    let result = bilang(abs);
    let trimmed = result.trim().to_string();

    if n < 0.0 {
        format!("minus {} rupiah", trimmed)
    } else {
        format!("{} rupiah", trimmed)
    }
}

fn bilang(n: u64) -> String {
    let satuan = [
        "", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan",
        "sepuluh", "sebelas",
    ];

    if n == 0 {
        return String::new();
    } else if n < 12 {
        return satuan[n as usize].to_string();
    } else if n < 20 {
        return format!("{} belas", bilang(n - 10));
    } else if n < 100 {
        return format!("{} puluh {}", bilang(n / 10), bilang(n % 10))
            .trim()
            .to_string();
    } else if n < 200 {
        return format!("seratus {}", bilang(n - 100)).trim().to_string();
    } else if n < 1_000 {
        return format!("{} ratus {}", bilang(n / 100), bilang(n % 100))
            .trim()
            .to_string();
    } else if n < 2_000 {
        return format!("seribu {}", bilang(n - 1_000)).trim().to_string();
    } else if n < 1_000_000 {
        return format!("{} ribu {}", bilang(n / 1_000), bilang(n % 1_000))
            .trim()
            .to_string();
    } else if n < 1_000_000_000 {
        return format!(
            "{} juta {}",
            bilang(n / 1_000_000),
            bilang(n % 1_000_000)
        )
        .trim()
        .to_string();
    } else if n < 1_000_000_000_000 {
        return format!(
            "{} miliar {}",
            bilang(n / 1_000_000_000),
            bilang(n % 1_000_000_000)
        )
        .trim()
        .to_string();
    } else {
        return format!(
            "{} triliun {}",
            bilang(n / 1_000_000_000_000),
            bilang(n % 1_000_000_000_000)
        )
        .trim()
        .to_string();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terbilang() {
        assert_eq!(terbilang(0.0), "nol rupiah");
        assert_eq!(terbilang(1.0), "satu rupiah");
        assert_eq!(terbilang(11.0), "sebelas rupiah");
        assert_eq!(terbilang(15.0), "lima belas rupiah");
        assert_eq!(terbilang(100.0), "seratus rupiah");
        assert_eq!(terbilang(150.0), "seratus lima puluh rupiah");
        assert_eq!(terbilang(1_000.0), "seribu rupiah");
        assert_eq!(terbilang(1_500.0), "seribu lima ratus rupiah");
        assert_eq!(
            terbilang(1_500_000.0),
            "satu juta lima ratus ribu rupiah"
        );
        assert_eq!(
            terbilang(25_750_000.0),
            "dua puluh lima juta tujuh ratus lima puluh ribu rupiah"
        );
    }
}
