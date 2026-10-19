use super::*;
use ratatui::style::Color;
use ratatui::style::Modifier;
use ratatui::style::Style;
use ratatui::text::Line;
use ratatui::text::Span;
use unicode_width::UnicodeWidthStr;

const DARK_BAR_STOPS: [(u8, u8, u8); 6] = [
    (45, 220, 100),
    (165, 235, 55),
    (250, 215, 45),
    (255, 145, 40),
    (245, 75, 105),
    (195, 95, 245),
];

const LIGHT_BAR_STOPS: [(u8, u8, u8); 6] = [
    (18, 168, 74),
    (108, 175, 16),
    (205, 142, 8),
    (222, 88, 16),
    (212, 36, 72),
    (142, 42, 202),
];

const PILL_DARK_FG: Color = Color::Rgb(16, 18, 26);

#[derive(Clone, Copy)]
struct HudPalette {
    is_light: bool,
    bar_stops: [(u8, u8, u8); 6],
    empty_segment: Color,
    divider: Color,
    frame_top: Color,
    frame_mid: Color,
    frame_bot: Color,
    cwd_arrow: Color,
    cwd_text: Color,
    git_symbol: Color,
    git_branch: Color,
    git_clean: Color,
    git_add: Color,
    git_del: Color,
    git_pr: Color,
    session_icon: Color,
    session_label: Color,
    session_text: Color,
    tasks_badge: Color,
    skills_badge: Color,
    fast_badge: Color,
    perm_label: Color,
    perm_full: Color,
    perm_workspace: Color,
    perm_readonly: Color,
    perm_other: Color,
    status_ready: Color,
    status_working: Color,
    status_thinking: Color,
    status_waiting: Color,
    status_starting: Color,
    status_other: Color,
    ctx_label: Color,
    muted_text: Color,
    week_label: Color,
    week_sup: Color,
    in_arrow: Color,
    in_label: Color,
    in_value: Color,
    cache_symbol: Color,
    cache_label: Color,
    cache_value: Color,
    out_arrow: Color,
    out_label: Color,
    out_value: Color,
    sigma_label: Color,
    sigma_value: Color,
    usd_value: Color,
}

impl HudPalette {
    const fn dark() -> Self {
        Self {
            is_light: false,
            bar_stops: DARK_BAR_STOPS,
            empty_segment: Color::Rgb(88, 96, 118),
            divider: Color::Rgb(90, 102, 128),
            frame_top: Color::Rgb(55, 225, 115),
            frame_mid: Color::Rgb(250, 200, 55),
            frame_bot: Color::Rgb(190, 120, 255),
            cwd_arrow: Color::Rgb(85, 215, 255),
            cwd_text: Color::Rgb(115, 220, 255),
            git_symbol: Color::Rgb(0, 240, 115),
            git_branch: Color::Rgb(150, 235, 165),
            git_clean: Color::Rgb(85, 215, 125),
            git_add: Color::Rgb(85, 235, 120),
            git_del: Color::Rgb(255, 105, 125),
            git_pr: Color::Rgb(195, 150, 255),
            session_icon: Color::Rgb(215, 130, 255),
            session_label: Color::Rgb(155, 140, 205),
            session_text: Color::Rgb(198, 208, 232),
            tasks_badge: Color::Rgb(105, 230, 155),
            skills_badge: Color::Rgb(255, 215, 125),
            fast_badge: Color::Rgb(255, 220, 75),
            perm_label: Color::Rgb(150, 162, 190),
            perm_full: Color::Rgb(255, 155, 85),
            perm_workspace: Color::Rgb(95, 225, 175),
            perm_readonly: Color::Rgb(120, 195, 255),
            perm_other: Color::Rgb(210, 190, 255),
            status_ready: Color::Rgb(65, 230, 125),
            status_working: Color::Rgb(80, 225, 255),
            status_thinking: Color::Rgb(255, 210, 75),
            status_waiting: Color::Rgb(255, 150, 65),
            status_starting: Color::Rgb(140, 200, 255),
            status_other: Color::Rgb(140, 215, 255),
            ctx_label: Color::Rgb(130, 205, 255),
            muted_text: Color::Rgb(162, 174, 202),
            week_label: Color::Rgb(220, 175, 255),
            week_sup: Color::Rgb(165, 145, 215),
            in_arrow: Color::Rgb(255, 226, 90),
            in_label: Color::Rgb(140, 205, 225),
            in_value: Color::Rgb(120, 235, 235),
            cache_symbol: Color::Rgb(255, 195, 80),
            cache_label: Color::Rgb(225, 185, 125),
            cache_value: Color::Rgb(255, 220, 135),
            out_arrow: Color::Rgb(255, 120, 180),
            out_label: Color::Rgb(225, 160, 195),
            out_value: Color::Rgb(255, 160, 210),
            sigma_label: Color::Rgb(195, 150, 255),
            sigma_value: Color::Rgb(220, 195, 255),
            usd_value: Color::Rgb(255, 145, 145),
        }
    }

    const fn light() -> Self {
        Self {
            is_light: true,
            bar_stops: LIGHT_BAR_STOPS,
            empty_segment: Color::Rgb(168, 178, 198),
            divider: Color::Rgb(135, 145, 168),
            frame_top: Color::Rgb(14, 148, 68),
            frame_mid: Color::Rgb(195, 118, 8),
            frame_bot: Color::Rgb(128, 42, 205),
            cwd_arrow: Color::Rgb(10, 112, 185),
            cwd_text: Color::Rgb(8, 88, 162),
            git_symbol: Color::Rgb(12, 142, 64),
            git_branch: Color::Rgb(18, 118, 58),
            git_clean: Color::Rgb(18, 135, 64),
            git_add: Color::Rgb(16, 138, 58),
            git_del: Color::Rgb(205, 32, 62),
            git_pr: Color::Rgb(118, 42, 198),
            session_icon: Color::Rgb(138, 38, 210),
            session_label: Color::Rgb(95, 72, 148),
            session_text: Color::Rgb(42, 52, 74),
            tasks_badge: Color::Rgb(14, 138, 68),
            skills_badge: Color::Rgb(172, 96, 8),
            fast_badge: Color::Rgb(185, 105, 6),
            perm_label: Color::Rgb(88, 98, 122),
            perm_full: Color::Rgb(198, 72, 12),
            perm_workspace: Color::Rgb(12, 135, 92),
            perm_readonly: Color::Rgb(14, 102, 182),
            perm_other: Color::Rgb(112, 48, 185),
            status_ready: Color::Rgb(14, 142, 64),
            status_working: Color::Rgb(8, 118, 178),
            status_thinking: Color::Rgb(185, 112, 8),
            status_waiting: Color::Rgb(198, 78, 14),
            status_starting: Color::Rgb(18, 102, 178),
            status_other: Color::Rgb(18, 108, 175),
            ctx_label: Color::Rgb(12, 102, 175),
            muted_text: Color::Rgb(78, 88, 112),
            week_label: Color::Rgb(102, 32, 178),
            week_sup: Color::Rgb(108, 78, 158),
            in_arrow: Color::Rgb(182, 112, 6),
            in_label: Color::Rgb(14, 108, 138),
            in_value: Color::Rgb(8, 122, 145),
            cache_symbol: Color::Rgb(192, 98, 8),
            cache_label: Color::Rgb(148, 82, 18),
            cache_value: Color::Rgb(172, 92, 6),
            out_arrow: Color::Rgb(198, 28, 105),
            out_label: Color::Rgb(152, 42, 98),
            out_value: Color::Rgb(178, 24, 102),
            sigma_label: Color::Rgb(122, 42, 198),
            sigma_value: Color::Rgb(92, 28, 168),
            usd_value: Color::Rgb(195, 36, 58),
        }
    }

    fn for_theme(is_light: bool) -> Self {
        if is_light {
            Self::light()
        } else {
            Self::dark()
        }
    }

    fn threshold_color(&self, percent: f64) -> Color {
        let pct = if percent.is_finite() {
            percent.clamp(0.0, 100.0)
        } else {
            0.0
        };
        if self.is_light {
            if pct < 50.0 {
                Color::Rgb(14, 142, 64)
            } else if pct < 80.0 {
                Color::Rgb(192, 112, 8)
            } else {
                Color::Rgb(208, 32, 58)
            }
        } else if pct < 50.0 {
            Color::Rgb(95, 230, 135)
        } else if pct < 80.0 {
            Color::Rgb(255, 195, 70)
        } else {
            Color::Rgb(255, 95, 115)
        }
    }

    fn permission_color(&self, perm: &str) -> Color {
        match perm {
            "Full Access" => self.perm_full,
            "Workspace" => self.perm_workspace,
            "Read Only" => self.perm_readonly,
            _ => self.perm_other,
        }
    }

    fn status_badge_span(&self, status: &str) -> Span<'static> {
        match status {
            "Ready" => styled("● Ready", self.status_ready, true),
            "Working" => styled("⠋ Working", self.status_working, true),
            "Thinking" => styled("◐ Thinking", self.status_thinking, true),
            "Waiting" => styled("◌ Waiting", self.status_waiting, true),
            "Starting" => styled("✦ Starting", self.status_starting, true),
            other => styled(format!("● {other}"), self.status_other, true),
        }
    }
}

fn is_light_theme_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("light")
        || lower.contains("day")
        || lower.contains("latte")
        || lower.contains("dawn")
        || lower.contains("lotus")
        || lower.contains("alabaster")
}

fn detect_light_mode(configured_theme: Option<&str>) -> bool {
    if let Ok(env_theme) = std::env::var("CODEX_HUD_THEME") {
        let trimmed = env_theme.trim();
        if trimmed.eq_ignore_ascii_case("light") {
            return true;
        }
        if trimmed.eq_ignore_ascii_case("dark") {
            return false;
        }
    }
    if crate::terminal_palette::default_bg().is_some_and(crate::color::is_light) {
        return true;
    }
    configured_theme.is_some_and(is_light_theme_name)
}

fn lerp_u8(a: u8, b: u8, t: f64) -> u8 {
    let t = t.clamp(0.0, 1.0);
    (f64::from(a) + (f64::from(b) - f64::from(a)) * t).round() as u8
}

fn lerp_rgb(a: (u8, u8, u8), b: (u8, u8, u8), t: f64) -> Color {
    Color::Rgb(
        lerp_u8(a.0, b.0, t),
        lerp_u8(a.1, b.1, t),
        lerp_u8(a.2, b.2, t),
    )
}

fn multi_stop_rgb(stops: &[(u8, u8, u8)], t: f64) -> Color {
    if stops.is_empty() {
        return Color::Reset;
    }
    if stops.len() == 1 {
        let (r, g, b) = stops[0];
        return Color::Rgb(r, g, b);
    }
    let scaled = t.clamp(0.0, 1.0) * (stops.len() - 1) as f64;
    let idx = (scaled.floor() as usize).min(stops.len() - 2);
    let local_t = scaled - idx as f64;
    lerp_rgb(stops[idx], stops[idx + 1], local_t)
}

fn styled(text: impl Into<String>, fg: Color, bold: bool) -> Span<'static> {
    let mut style = Style::default().fg(fg);
    if bold {
        style = style.add_modifier(Modifier::BOLD);
    }
    Span::styled(text.into(), style)
}

fn divider_with(palette: &HudPalette) -> Span<'static> {
    styled(" │ ", palette.divider, false)
}

fn spans_width(spans: &[Span<'_>]) -> usize {
    spans
        .iter()
        .map(|s| UnicodeWidthStr::width(s.content.as_ref()))
        .sum()
}

fn bar_with_palette(
    percent: f64,
    segments: usize,
    palette: &HudPalette,
) -> Vec<Span<'static>> {
    let segments = segments.max(1);
    let clamped = if percent.is_finite() {
        percent.clamp(0.0, 100.0)
    } else {
        0.0
    };
    let filled = ((clamped / 100.0) * segments as f64).round() as usize;
    let denom = (segments.saturating_sub(1)).max(1) as f64;
    (0..segments)
        .map(|i| {
            if i < filled {
                let color = multi_stop_rgb(&palette.bar_stops, i as f64 / denom);
                Span::styled("█", Style::default().fg(color))
            } else {
                Span::styled("░", Style::default().fg(palette.empty_segment))
            }
        })
        .collect()
}

#[cfg(test)]
pub(super) fn bar(percent: f64) -> Vec<Span<'static>> {
    bar_with_palette(percent, 16, &HudPalette::dark())
}

fn effort_pill_stops(effort: &str) -> ((u8, u8, u8), (u8, u8, u8)) {
    let lower = effort.to_ascii_lowercase();
    if lower.contains("xhigh") || lower.contains("max") {
        ((240, 130, 255), (105, 220, 255))
    } else if lower.contains("high") {
        ((255, 200, 75), (255, 130, 175))
    } else if lower.contains("med") {
        ((85, 230, 155), (100, 205, 255))
    } else {
        ((125, 205, 245), (160, 175, 255))
    }
}

pub(super) fn model_pill_spans(model: &str, effort: &str) -> Vec<Span<'static>> {
    let (start_rgb, end_rgb) = effort_pill_stops(effort);
    let start_color = Color::Rgb(start_rgb.0, start_rgb.1, start_rgb.2);
    let end_color = Color::Rgb(end_rgb.0, end_rgb.1, end_rgb.2);

    let prefix = format!(" ✦ {model}");
    let suffix = if effort.is_empty() {
        " ".to_string()
    } else {
        format!(" ({effort}) ")
    };
    let prefix_chars: Vec<char> = prefix.chars().collect();
    let suffix_chars: Vec<char> = suffix.chars().collect();
    let total_chars = (prefix_chars.len() + suffix_chars.len()).max(1);
    let denom = (total_chars.saturating_sub(1)).max(1) as f64;

    let mut spans = Vec::with_capacity(total_chars + 2);
    spans.push(Span::styled("▐", Style::default().fg(start_color)));

    for (idx, ch) in prefix_chars.iter().enumerate() {
        let bg = lerp_rgb(start_rgb, end_rgb, idx as f64 / denom);
        spans.push(Span::styled(
            ch.to_string(),
            Style::default()
                .fg(PILL_DARK_FG)
                .bg(bg)
                .add_modifier(Modifier::BOLD),
        ));
    }

    for (offset, ch) in suffix_chars.iter().enumerate() {
        let idx = prefix_chars.len() + offset;
        let bg = lerp_rgb(start_rgb, end_rgb, idx as f64 / denom);
        spans.push(Span::styled(
            ch.to_string(),
            Style::default()
                .fg(PILL_DARK_FG)
                .bg(bg)
                .add_modifier(Modifier::BOLD | Modifier::ITALIC),
        ));
    }

    spans.push(Span::styled("▌", Style::default().fg(end_color)));
    spans
}

fn compact_session_id(session_id: &str) -> String {
    let chars: Vec<char> = session_id.chars().collect();
    if chars.len() <= 16 {
        return session_id.to_string();
    }
    let head: String = chars[..8].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{head}…{tail}")
}

impl ChatWidget {
    pub(super) fn rainbow_status_lines(&self) -> Vec<Line<'static>> {
        let is_light = detect_light_mode(self.config.tui_theme.as_deref());
        let p = HudPalette::for_theme(is_light);

        let term_width = self
            .last_rendered_width
            .get()
            .or_else(|| crossterm::terminal::size().ok().map(|(w, _)| w))
            .unwrap_or(112);
        let avail = usize::from(term_width.saturating_sub(4)).max(40);
        let ultra_compact = avail < 62;

        // ── Row 1: Workspace CWD · Git Branch & Diff · Session UUID · Tasks/Skills ──
        let cwd_path = self.status_line_cwd();
        let cwd_name = cwd_path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| format_directory_display(cwd_path, None));

        let mut row1 = vec![
            styled("╭─ ", p.frame_top, true),
            styled("▸ ", p.cwd_arrow, true),
            styled(cwd_name, p.cwd_text, true),
        ];

        if let Some(branch) = self
            .status_line_branch
            .as_deref()
            .filter(|b| !b.is_empty())
        {
            row1.push(styled("  ∈ ", p.git_symbol, true));
            row1.push(styled(branch.to_string(), p.git_branch, true));
            if !ultra_compact
                && let Some(summary) = self.status_line_git_summary.as_ref()
            {
                if let Some(stats) = summary.branch_change_stats.as_ref() {
                    if stats.additions == 0 && stats.deletions == 0 {
                        row1.push(styled(" ✓", p.git_clean, false));
                    } else {
                        row1.push(styled(
                            format!(" +{}", stats.additions),
                            p.git_add,
                            true,
                        ));
                        row1.push(styled(
                            format!(" -{}", stats.deletions),
                            p.git_del,
                            true,
                        ));
                    }
                }
                if let Some(pr) = summary.pull_request.as_ref() {
                    row1.push(styled(format!(" #{}", pr.number), p.git_pr, true));
                }
            }
        }

        let session_raw = self
            .thread_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "new-session".to_string());
        let row1_used = spans_width(&row1);
        let full_session_needed = 3 + 2 + session_raw.len();
        let use_full_session = !ultra_compact && (row1_used + full_session_needed <= avail);
        let session_display = if use_full_session {
            session_raw
        } else if row1_used + 3 + 2 + 13 <= avail {
            compact_session_id(&session_raw)
        } else {
            session_raw.chars().take(8).collect()
        };
        row1.push(divider_with(&p));
        row1.push(styled("◈ ", p.session_icon, true));
        if avail >= 96 && use_full_session {
            row1.push(styled("ID ", p.session_label, true));
        }
        row1.push(styled(session_display, p.session_text, false));

        let extra_badge = if let Some(tasks) = self.terminal_title_task_progress() {
            Some((format!("✦ {tasks}"), p.tasks_badge, true))
        } else if !self.skills_all.is_empty() {
            Some((
                format!("✦ {} skills", self.skills_all.len()),
                p.skills_badge,
                false,
            ))
        } else {
            None
        };
        if let Some((text, color, bold)) = extra_badge {
            let needed = 3 + UnicodeWidthStr::width(text.as_str());
            if spans_width(&row1) + needed <= avail {
                row1.push(divider_with(&p));
                row1.push(styled(text, color, bold));
            }
        }

        // ── Row 2: YAS Model+Effort Pill · Permissions · Runtime Status · CTX Gauge ──
        let mut row2 = vec![styled("├─ ", p.frame_mid, true)];
        let effort = self.reasoning_display_name();
        row2.extend(model_pill_spans(self.model_display_name(), &effort));

        if self.current_service_tier() == Some(ServiceTier::Fast.request_value()) {
            row2.push(styled(" ✦Fast", p.fast_badge, true));
        }

        let row2_sep = if avail < 68 { "│" } else { " │ " };
        let perms = permissions_display(&self.config);
        row2.push(styled(row2_sep, p.divider, false));
        if avail >= 96 {
            row2.push(styled("PERM ", p.perm_label, true));
        }
        row2.push(styled(perms.clone(), p.permission_color(&perms), true));

        row2.push(styled(row2_sep, p.divider, false));
        row2.push(p.status_badge_span(&self.run_state_status_text()));

        let ctx_pct = self.status_line_context_used_percent().unwrap_or(0).clamp(0, 100);
        let pct_text = format!("{ctx_pct}%");
        row2.push(styled(row2_sep, p.divider, false));
        row2.push(styled("CTX ", p.ctx_label, true));
        let remaining_for_ctx = avail.saturating_sub(spans_width(&row2) + pct_text.len());
        let ctx_segments = if remaining_for_ctx >= 9 {
            8
        } else if remaining_for_ctx >= 5 {
            4
        } else {
            0
        };
        if ctx_segments > 0 {
            row2.extend(bar_with_palette(ctx_pct as f64, ctx_segments, &p));
            row2.push(styled(
                format!(" {pct_text}"),
                p.threshold_color(ctx_pct as f64),
                true,
            ));
        } else {
            row2.push(styled(pct_text, p.threshold_color(ctx_pct as f64), true));
        }
        if let Some(window_size) = self.status_line_context_window_size()
            && window_size > 0
        {
            let used_tokens = if self.token_usage_pending {
                0
            } else {
                self.status_line_total_usage().blended_total().max(0)
            };
            let ratio_text = format!(
                " ({}/{})",
                format_tokens_compact(used_tokens),
                format_tokens_compact(window_size)
            );
            if spans_width(&row2) + UnicodeWidthStr::width(ratio_text.as_str()) <= avail {
                row2.push(styled(ratio_text, p.muted_text, false));
            }
        }

        // ── Row 3: 7-Day Weekly Quota (10080m only) · Token Breakdown (IN / ⊂CACHE / OUT / Σ) ──
        let weekly = self
            .rate_limit_snapshots_by_limit_id
            .get("codex")
            .and_then(|snapshot| {
                snapshot
                    .primary
                    .iter()
                    .chain(snapshot.secondary.iter())
                    .find(|window| window.window_minutes == Some(10080))
            });

        let mut row3 = vec![
            styled("╰─ ", p.frame_bot, true),
            styled("WEEK", p.week_label, true),
        ];
        if !ultra_compact {
            row3.push(styled("⁷ᵈ ", p.week_sup, false));
        } else {
            row3.push(styled(" ", p.divider, false));
        }

        let week_segments = if avail >= 92 {
            16
        } else if avail >= 76 {
            12
        } else if avail >= 66 {
            10
        } else {
            8
        };
        match weekly {
            Some(window) if window.used_percent.is_finite() => {
                let pct = window.used_percent.clamp(0.0, 100.0);
                row3.extend(bar_with_palette(pct, week_segments, &p));
                row3.push(styled(
                    format!(" {pct:.0}% used"),
                    p.threshold_color(pct),
                    true,
                ));
            }
            _ => {
                row3.extend(bar_with_palette(0.0, week_segments, &p));
                row3.push(styled(" --%", p.perm_label, false));
            }
        }

        let (in_tokens, cached_tokens, out_tokens, total_tokens) = if self.token_usage_pending {
            (0_i64, 0_i64, 0_i64, 0_i64)
        } else {
            let usage = self.status_line_total_usage();
            (
                usage.input_tokens.max(0),
                usage.cached_input_tokens.max(0),
                usage.output_tokens.max(0),
                usage.blended_total().max(0),
            )
        };
        let cache_hit_pct = if in_tokens > 0 {
            ((cached_tokens as f64 / in_tokens as f64) * 100.0)
                .round()
                .clamp(0.0, 100.0) as i64
        } else {
            0
        };

        let gap = if avail >= 92 { "  " } else { " " };
        row3.push(divider_with(&p));
        row3.push(styled("↓", p.in_arrow, true));
        row3.push(styled("IN ", p.in_label, true));
        row3.push(styled(format_tokens_compact(in_tokens), p.in_value, true));

        row3.push(styled(gap, p.divider, false));
        row3.push(styled("⊂", p.cache_symbol, true));
        row3.push(styled("CACHE ", p.cache_label, true));
        row3.push(styled(
            format_tokens_compact(cached_tokens),
            p.cache_value,
            true,
        ));
        let out_preview_len =
            gap.len() + 5 + UnicodeWidthStr::width(format_tokens_compact(out_tokens).as_str());
        let hit_text = format!(" ({cache_hit_pct}%)");
        if !ultra_compact && spans_width(&row3) + hit_text.len() + out_preview_len <= avail {
            row3.push(styled(hit_text, p.muted_text, false));
        }

        row3.push(styled(gap, p.divider, false));
        row3.push(styled("↑", p.out_arrow, true));
        row3.push(styled("OUT ", p.out_label, true));
        row3.push(styled(format_tokens_compact(out_tokens), p.out_value, true));

        let total_text = format_tokens_compact(total_tokens);
        let sigma_needed = gap.len() + 2 + UnicodeWidthStr::width(total_text.as_str());
        if !ultra_compact && spans_width(&row3) + sigma_needed <= avail {
            row3.push(styled(format!("{gap}Σ "), p.sigma_label, true));
            row3.push(styled(total_text, p.sigma_value, true));
        }

        if let Some(usd) = self
            .estimated_thread_usage()
            .and_then(|usage| usage.estimated_usage_usd_micros)
            .and_then(format_estimated_usd_micros)
        {
            let usd_needed = 3 + UnicodeWidthStr::width(usd.as_str());
            if spans_width(&row3) + usd_needed <= avail {
                row3.push(divider_with(&p));
                row3.push(styled(usd, p.usd_value, true));
            }
        }

        vec![Line::from(row1), Line::from(row2), Line::from(row3)]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quota_bar_clamps_and_preserves_rainbow_colors() {
        for (percent, expected) in [
            (0.0, 0),
            (50.0, 8),
            (100.0, 16),
            (-10.0, 0),
            (200.0, 16),
            (f64::NAN, 0),
        ] {
            let spans = bar(percent);
            assert_eq!(spans.len(), 16);
            assert_eq!(spans.iter().filter(|s| s.content == "█").count(), expected);
        }
        assert_ne!(bar(100.0)[0].style.fg, bar(100.0)[15].style.fg);
    }

    #[test]
    fn light_and_dark_palettes_differ_and_recognize_theme_names() {
        let dark = HudPalette::for_theme(false);
        let light = HudPalette::for_theme(true);
        assert_ne!(dark.cwd_text, light.cwd_text);
        assert_ne!(dark.session_text, light.session_text);
        assert!(is_light_theme_name("tokyo-night-day"));
        assert!(is_light_theme_name("catppuccin-latte"));
        assert!(!is_light_theme_name("tokyo-night"));
    }

    #[test]
    fn model_pill_uses_contrasted_gradient_and_caps() {
        let spans = model_pill_spans("GPT-6.1-Sol", "high");
        assert_eq!(spans.first().map(|s| s.content.as_ref()), Some("▐"));
        assert_eq!(spans.last().map(|s| s.content.as_ref()), Some("▌"));
        let body: String = spans[1..spans.len() - 1]
            .iter()
            .map(|s| s.content.as_ref())
            .collect();
        assert!(body.contains("GPT-6.1-Sol"));
        assert!(body.contains("(high)"));
        assert_eq!(spans[1].style.fg, Some(PILL_DARK_FG));
        assert!(spans[1].style.bg.is_some());
        assert_ne!(spans[1].style.bg, spans[spans.len() - 2].style.bg);
    }

    #[test]
    fn compact_session_id_preserves_head_and_tail() {
        let id = "019da3ca-f752-74a1-9621-fd0974c24510";
        assert_eq!(compact_session_id(id), "019da3ca…4510");
        assert_eq!(compact_session_id("new-session"), "new-session");
    }
}
